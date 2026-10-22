// Letters: how Perso-Arabic letters change shape as they join, and the order new letters are taught in.

import { shuffle, sample } from './ui.js';

// These join only to the letter before them (on their right), never to the one after.
const RIGHT_ONLY = new Set([...'اآأإٱدذرزژوؤڈڑډړږۀڊڌڏڍڙۇۆۉۋےۓۃة']);
// These don't join at all, or are only written at the end of a word.
const NON_JOINING = new Set([...'ء۾۽']);
const END_ONLY = new Set([...'ں']);
const ARABIC_LETTER = /^[ؠ-يٮ-ۓۺ-ۿ]$/;
const TATWEEL = 'ـ';

// The shapes a letter takes at the start, middle and end of a word (shown joined to a tatweel ـ),
// or null for scripts and signs where letters don't change shape.
export function joinForms(l, dir) {
  const ch = l.char;
  if (dir !== 'rtl' || [...ch].length !== 1 || !ARABIC_LETTER.test(ch) || NON_JOINING.has(ch)) return null;
  if (END_ONLY.has(ch)) return { alone: ch, end: TATWEEL + ch, joins: 'end' };
  if (RIGHT_ONLY.has(ch)) return { alone: ch, end: TATWEEL + ch, joins: 'right' };
  return { alone: ch, start: ch + TATWEEL, middle: TATWEEL + ch + TATWEEL, end: TATWEEL + ch, joins: 'both' };
}
export const POSITIONS = [
  ['alone', 'on its own'],
  ['start', 'at the start of a word'],
  ['middle', 'in the middle of a word'],
  ['end', 'at the end of a word'],
];
// Letters in this script that never join to the next one.
export const rightJoiners = (letters, dir) => letters.filter((l) => joinForms(l, dir)?.joins === 'right');

// Letters worth teaching one by one: everything with a sound, but not the digits.
export const teachable = (letters) => letters.filter((l) => l.roman && !/digit|numeral|number/i.test(l.group + ' ' + l.groupTitle) && !/^[0-9०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯۰-۹]$/.test(l.char));

// A learning session for letters. New letters are introduced one at a time, each quizzed straight
// away, then again a few questions later in the other direction, and once more at the end, so each
// one is recalled at growing gaps (0 → ~3 → ~6 → end). Letters due for review are woven in between,
// so the first letters you learned keep coming back. `Q` is the question builder from session.js.
export function letterLesson({ fresh, due, known, all, dir, Q, perSession = 4 }) {
  const nNew = fresh.length ? (due.length >= 10 ? 2 : due.length >= 5 ? 3 : perSession) : 0;
  const newOnes = fresh.slice(0, nNew);
  const reviews = due.slice(0, 10);
  const met = [...known];
  // wrong choices: letters you have met, topped up with neighbours in the script
  const pool = (l) => {
    const near = all.filter((x) => x.group === l.group);
    const base = met.length >= 6 ? met : [...met, ...near, ...all.slice(Math.max(0, all.indexOf(l) - 6), all.indexOf(l) + 6)];
    // two letters with the same sound can't both be offered for "find the letter for t"
    return [...new Set([l, ...base])].filter((x) => x === l || x.roman !== l.roman);
  };
  const name = (l) => Q.letterName(l, pool(l));
  const find = (l) => Q.letterFind(l, pool(l));
  const form = (l) => {
    const f = joinForms(l, dir);
    const pos = f && ['start', 'middle', 'end'].filter((p) => f[p]);
    return pos?.length ? Q.letterForm(l, pool(l).filter((x) => joinForms(x, dir)), sample(pos, 1)[0], f) : null;
  };
  const either = (l) => (Math.random() < 0.5 ? name(l) : find(l));
  const qs = [];
  let r = 0;
  newOnes.forEach((l, i) => {
    qs.push(Q.letterIntro(l));
    met.push(l);
    qs.push(name(l));
    if (i >= 1) qs.push(find(newOnes[i - 1]));
    if (i >= 2) qs.push(form(newOnes[i - 2]) || name(newOnes[i - 2]));
    if (reviews[r]) qs.push(either(reviews[r++]));
  });
  const tail = [
    ...newOnes.map((l) => find(l)),
    ...newOnes.slice(-2).map((l) => form(l)).filter(Boolean),
    ...reviews.slice(r).map((l) => form(l) && Math.random() < 0.3 ? form(l) : either(l)),
  ];
  // the last new letter has had the least practice, so it doesn't open the final round
  const mixed = shuffle(tail);
  const last = newOnes[newOnes.length - 1];
  if (last && mixed[0]?.item === last) mixed.push(mixed.shift());
  qs.push(...mixed);
  return { questions: qs, newOnes, reviews };
}
