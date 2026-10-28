#!/usr/bin/env node
// Generates data/languages.json from each language's course.json, and stamps the
// service worker with a content hash + precache list. Run after editing content.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ORDER = ['hi', 'ur', 'bn', 'pa', 'ne', 'ps', 'sd', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'or'];

const langs = [];
for (const code of fs.readdirSync(DATA).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))) {
  const cf = path.join(DATA, code, 'course.json');
  if (!fs.existsSync(cf)) continue;
  const unitsDir = path.join(DATA, code, 'units');
  // --tracked: only units already in git (staged or committed), so work in progress never goes live
  let unitFiles = fs.existsSync(unitsDir) ? fs.readdirSync(unitsDir).filter((f) => /^\d+\.json$/.test(f)).sort() : [];
  if (process.argv.includes('--tracked')) {
    const tracked = new Set(require('child_process').execSync(`git ls-files data/${code}/units`, { cwd: ROOT }).toString().split('\n').map((f) => path.basename(f)));
    unitFiles = unitFiles.filter((f) => tracked.has(f));
  }
  // units are numbered from 1 with no gaps: stop at the first missing one
  unitFiles = unitFiles.filter((f, i) => parseInt(f, 10) === i + 1);
  if (unitFiles.length < 20 && !(process.argv.includes('--partial') && unitFiles.length)) {
    console.log(`skip ${code}: only ${unitFiles.length}/20 units`);
    continue;
  }
  const c = JSON.parse(fs.readFileSync(cf, 'utf8'));
  let vocab = 0;
  let phrases = 0;
  for (const f of unitFiles) {
    const u = JSON.parse(fs.readFileSync(path.join(unitsDir, f), 'utf8'));
    vocab += (u.vocab || []).length;
    phrases += (u.phrases || []).length;
  }
  const letters = c.script.groups.reduce((s, g) => s + g.letters.length, 0);
  langs.push({
    code,
    name: c.name,
    native: c.native,
    script: c.scriptName || (typeof c.script === 'string' ? c.script : ''),
    dir: c.dir,
    tts: c.tts,
    font: c.font,
    speakers: c.speakers,
    where: c.where,
    tagline: c.tagline,
    units: unitFiles.length,
    vocab,
    phrases,
    letters,
    sample: c.native,
    audio: fs.existsSync(path.join(ROOT, 'audio', code, 'index.json')),
  });
}
fs.writeFileSync(path.join(DATA, 'languages.json'), JSON.stringify(langs, null, 1) + '\n');
console.log(`languages.json: ${langs.map((l) => `${l.code}(${l.vocab}w)`).join(' ')}`);

// service worker
const files = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/icon.svg', 'data/languages.json'];
for (const dir of ['js', 'js/views']) for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.js')) files.push(`${dir}/${f}`);
const hash = crypto.createHash('sha1');
for (const f of files.slice(1)) hash.update(fs.readFileSync(path.join(ROOT, f)));
for (const l of langs) {
  hash.update(fs.readFileSync(path.join(DATA, l.code, 'course.json')));
  for (const f of fs.readdirSync(path.join(DATA, l.code, 'units'))) hash.update(fs.readFileSync(path.join(DATA, l.code, 'units', f)));
}
const version = hash.digest('hex').slice(0, 10);
const sw = fs.readFileSync(path.join(ROOT, 'sw.template.js'), 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files));
fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);
console.log(`sw.js version ${version} (${files.length} precached files)`);
