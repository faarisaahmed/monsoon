#!/usr/bin/env node
// Writes course JSON in the repo's house style: objects that hold only plain values (a word, a
// sentence, a tip) on one line, everything else spread over lines with two-space indents.
//   node scripts/fmt.js data/hi/units/01.json [...]   reformat files in place
//   require('./fmt').write(file, obj)                  write an object in this style
const fs = require('fs');

const plain = (x) => x === null || typeof x !== 'object';
// a sentence may carry a short list of strings ("wrong": ["हैं|haiṃ", "हो|ho"]) and still sit on one line
const leaf = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => plain(x) || (Array.isArray(x) && x.every(plain)));

function fmt(v, ind = '') {
  if (plain(v)) return JSON.stringify(v);
  const next = ind + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(plain)) {
      const one = '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
      if (one.length < 100 || v.every((x) => typeof x === 'string' && x.length < 40)) return one;
    }
    return '[\n' + v.map((x) => next + fmt(x, next)).join(',\n') + '\n' + ind + ']';
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  if (leaf(v)) return '{ ' + keys.map((k) => JSON.stringify(k) + ': ' + (Array.isArray(v[k]) ? '[' + v[k].map((x) => JSON.stringify(x)).join(', ') + ']' : JSON.stringify(v[k]))).join(', ') + ' }';
  return '{\n' + keys.map((k) => next + JSON.stringify(k) + ': ' + fmt(v[k], next)).join(',\n') + '\n' + ind + '}';
}

const write = (file, obj) => fs.writeFileSync(file, fmt(obj) + '\n');
module.exports = { fmt, write };

if (require.main === module) for (const f of process.argv.slice(2)) write(f, JSON.parse(fs.readFileSync(f, 'utf8')));
