// Full sentences for grammar and structure practice: each unit's grammar examples and dialogue lines.
// "Fill the gap" questions blank out the word a grammar point is about (an ending, a postposition,
// a verb form) and offer other forms of that same word from the course as the wrong choices.

const PUNCT = /[?.!,।॥۔؟،:;"“”‘’()[\]…–—]/g;
export const tokens = (s) => (s || '').replace(PUNCT, ' ').split(/\s+/).filter(Boolean);
const chars = (s) => [...s];
const NATIVE = /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u;
const MARK = /\p{M}/u;

export function unitSentences(u) {
  const out = [];
  const seen = new Set();
  const push = (s, extra) => {
    if (!s?.native || tokens(s.native).length < 2 || seen.has(s.native)) return;
    seen.add(s.native);
    // a gloss note in the script ("(को → default देखा)") would give the answer away: keep it for afterwards
    const notes = (s.en || '').match(/\s*\([^)]*\)/g)?.filter((n) => NATIVE.test(n)) || [];
    const en = notes.reduce((t, n) => t.replace(n, ''), s.en || '').trim();
    out.push({ native: s.native, roman: s.roman, en, note: notes.map((n) => n.trim().slice(1, -1)).join('; ') || undefined, kind: 'sentence', unit: u.id, key: `s:${s.native}`, ...extra });
  };
  (u.grammar || []).forEach((g, gi) => g.examples.forEach((e) => push(e, { grammar: gi, topic: g.title })));
  (u.dialogue?.lines || []).forEach((l) => push(l, { topic: u.dialogue.title }));
  return out;
}

// The native forms a grammar point highlights in bold: whole words (था, ने, को) and endings (-ಅಲ್ಲಿ).
export function grammarForms(g) {
  const words = new Set();
  const endings = new Set();
  for (const [, b] of (g?.body || '').matchAll(/\*\*(.+?)\*\*/g)) {
    for (const part of b.split(/[\s/,·]+/)) {
      if (!NATIVE.test(part)) continue;
      const t = part.replace(PUNCT, '');
      if (/^[-‑]/.test(t) || /[-‑]$/.test(t)) {
        // "-ಅಲ್ಲಿ" is written with the joining vowel: the part you see on a word starts after it
        let e = t.replace(/[-‑+]/g, '');
        const cs = chars(e);
        if (cs.length > 2 && !MARK.test(cs[0]) && /\p{L}/u.test(cs[0]) && isVowelLetter(cs[0])) e = cs.slice(1).join('');
        if (chars(e).length >= 1) endings.add(e);
      } else if (t) words.add(t);
    }
  }
  return { words: [...words], endings: [...endings] };
}
// independent vowel letters of the Indic scripts (used only to trim a written joining vowel)
const isVowelLetter = (c) => /[ऄ-औঅ-ঔਅ-ਔઅ-ઔଅ-ଔஅ-ஔఅ-ఔಅ-ಔഅ-ഔ]/u.test(c);

// Every word form in the course with its romanization, used as wrong choices.
export function buildLexicon(items) {
  const lex = new Map();
  for (const it of items) {
    const n = tokens(it.native);
    const r = tokens((it.roman || '').replace(/[?.!,:;"“”‘’()…–—]/g, ' '));
    n.forEach((t, i) => {
      if (!NATIVE.test(t)) return;
      const roman = n.length === r.length ? r[i].toLowerCase() : null;
      if (!lex.has(t) || (!lex.get(t) && roman)) lex.set(t, roman);
    });
  }
  return lex;
}

const commonPrefix = (a, b) => {
  const A = chars(a), B = chars(b);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  return i;
};
// Other forms of the same word: one stem, only the ending differs (आया / आई / आए, ಮಾಡಿದೆ / ಮಾಡಿದಳು).
const VIRAMA = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D]/u;
// spelling variants of one form aren't wrong answers: ஊரு / ஊர், ரூபா / ரூபாய்
function variant(a, b) {
  const [s, l] = chars(a).length <= chars(b).length ? [chars(a), chars(b)] : [chars(b), chars(a)];
  const p = commonPrefix(a, b);
  const rs = s.slice(p), rl = l.slice(p);
  if (rs.length <= 1 && rl.length <= 1 && (VIRAMA.test(rs[0] || '') || VIRAMA.test(rl[0] || ''))) return true;
  return rs.length === 0 && rl.length === 2 && VIRAMA.test(rl[1]);
}
// vowel signs, nasal marks and (in Perso-Arabic scripts) the letters that write vowels
const SOFT = /[\p{M}اآوےیئںۓۂۃ]/u;
const hardCount = (cs) => cs.filter((c) => !SOFT.test(c)).length;
function family(word, lex, exclude) {
  const n = chars(word).length;
  const out = [];
  for (const t of lex.keys()) {
    if (exclude.has(t) || variant(word, t)) continue;
    const m = chars(t).length;
    const p = commonPrefix(word, t);
    if (p < 1 || p < Math.ceil(n * 0.5) || n - p > 3 || m - p > 3) continue;
    // short words may differ only in their vowels (है / हैं / हो, की / का / के); longer ones by an ending
    // (and then only on a real shared stem of two consonants or more)
    const room = n <= 3 ? 0 : 1;
    if (hardCount(chars(word).slice(p)) > room || hardCount(chars(t).slice(p)) > room) continue;
    if (room && hardCount(chars(word).slice(0, p)) < 2) continue;
    // a stem has to end on a whole letter, not between a consonant and its vowel sign
    if (MARK.test(chars(word)[p] || '') && MARK.test(chars(t)[p] || '') === false && n - p > 2) continue;
    out.push([p * 2 - Math.abs(m - n), t]);
  }
  return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

// Builds a fill-the-gap question for a sentence, or null when no good gap exists.
export function cloze(item, { forms, lex, rnd = Math.random }) {
  const toks = tokens(item.native);
  if (toks.length < 2) return null;
  const romans = tokens((item.roman || '').replace(/[?.!,:;"“”‘’()…–—]/g, ' '));
  const aligned = romans.length === toks.length;
  const once = (t) => toks.filter((x) => x === t).length === 1;
  const W = forms?.words || [];
  const E = forms?.endings || [];
  const candidates = [];
  toks.forEach((t, i) => {
    if (!once(t) || !NATIVE.test(t)) return;
    if (W.includes(t)) candidates.push({ i, rank: 0, pool: W });
    else if (E.some((e) => t.endsWith(e) && chars(t).length > chars(e).length)) candidates.push({ i, rank: 1 });
  });
  // with nothing highlighted, the last word (usually the verb, carrying tense and agreement)
  if (!candidates.length) candidates.push({ i: toks.length - 1, rank: 2 });
  candidates.sort((a, b) => a.rank - b.rank || rnd() - 0.5);

  for (const c of candidates) {
    const answer = toks[c.i];
    const exclude = new Set([answer, ...toks]);
    const strip = (s) => s.normalize('NFC');
    let wrong = [];
    // forms of the same word first, then the other forms this grammar point teaches
    for (const f of family(answer, lex, exclude)) if (strip(f) !== strip(answer)) wrong.push(f);
    if (c.pool) {
      const near = (w) => Math.abs(chars(w).length - chars(answer).length);
      // only ones of the same sort: short function words (ने / को / से) or the same ending
      const short = (w) => chars(w).length <= 3;
      const alike = (w) => (short(w) && short(answer)) || chars(w).at(-1) === chars(answer).at(-1);
      const rest = c.pool.filter((w) => lex.has(w) && alike(w) && !exclude.has(w) && !wrong.includes(w) && !variant(w, answer));
      wrong.push(...rest.sort((a, b) => near(a) - near(b) || rnd() - 0.5));
    }
    wrong = wrong.slice(0, 3);
    if (wrong.length < 2) continue;
    const opts = [answer, ...wrong].sort(() => rnd() - 0.5);
    return {
      type: 'cloze',
      item,
      gap: c.i,
      before: toks.slice(0, c.i).join(' '),
      after: toks.slice(c.i + 1).join(' '),
      romanBefore: aligned ? romans.slice(0, c.i).join(' ') : null,
      romanAfter: aligned ? romans.slice(c.i + 1).join(' ') : null,
      options: opts.map((o) => ({ native: o, roman: o === answer && aligned ? romans[c.i].toLowerCase() : lex.get(o) || null })),
      answer: opts.indexOf(answer),
    };
  }
  return null;
}
