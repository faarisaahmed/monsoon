import { h, clear, shuffle, sample, go } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { ICONS } from '../components.js';
import { canSpeak, canRecognize, canRecord, listeningOn, speakingOn } from '../audio.js';
import { runSession, Q, mixedQuestions, sentenceQuestions, sentenceQuestion } from '../session.js';
import { crumbs } from './shared.js';
import { notFound } from './lang.js';
import { letterLesson, teachable } from '../letters.js';

const MODES = [
  { id: 'mixed', icon: 'refresh', title: 'Mixed practice', desc: 'A bit of everything from what you have learned.' },
  { id: 'grammar', icon: 'check', title: 'Grammar in sentences', desc: 'Full sentences from the grammar lessons: fill the gap with the right form, put the words in order, translate.' },
  { id: 'flashcards', icon: 'cards', title: 'Flashcards', desc: 'Classic cards, both directions, graded by you.' },
  { id: 'listening', icon: 'ear', title: 'Listening', desc: 'Hear a word or sentence, pick its meaning.', audio: true },
  { id: 'dictation', icon: 'ear', title: 'Dictation', desc: 'Hear it, type what you heard.', audio: true },
  { id: 'translate', icon: 'keyboard', title: 'Translate', desc: 'English → type it in romanization.' },
  { id: 'typing-script', icon: 'keyboard', title: 'Type in the script', desc: 'English → type it in the native script, with an on-screen keyboard.' },
  { id: 'sentences', icon: 'puzzle', title: 'Sentence builder', desc: 'Put the words of a sentence in the right order: phrases, grammar examples and dialogue lines.', hidden: true },
  { id: 'speaking', icon: 'mic', title: 'Speaking', desc: 'Say it aloud; get checked by speech recognition or compare a recording.', mic: true },
  { id: 'letters', icon: 'letters', title: 'Learn letters', desc: 'New letters one at a time, each tested straight away, with the ones you know coming back to stay fresh.' },
  { id: 'reading-words', icon: 'book', title: 'Read real words', desc: 'Sound out words in the script — no romanization shown.' },
  { id: 'writing', icon: 'pen', title: 'Handwriting', desc: 'Draw letters from memory on the writing pad.' },
  { id: 'numbers', icon: 'hash', title: 'Numbers', desc: 'Hear a number, type it in digits.', audio: true },
];

async function pools(code) {
  const [c, units, lex] = await Promise.all([data.course(code), data.allUnits(code), data.lexicon(code)]);
  const all = units.flatMap((u) => data.unitItems(code, u));
  const learned = all.filter((it) => store.card(code, it.key));
  const sentences = units.flatMap((u) => data.unitSentenceItems(u));
  // sentences from the units you have reached: any word learned, grammar read, or sentences practised
  const reached = new Set(units.filter((u) => { const us = store.unitState(code, u.id); return us.grammar || us.sentences || learned.some((i) => i.unit === u.id); }).map((u) => u.id));
  const reachedSentences = sentences.filter((s) => reached.has(s.unit));
  return { c, units, all, learned, sentences, reachedSentences, lex, letters: data.scriptLetters(c) };
}

export async function practiceHub({ code, L }) {
  const { learned, units } = await pools(code);
  const voice = listeningOn(L.tts);
  return h(
    'div',
    { 'data-title': 'Practice' },
    crumbs([L.name, `#/l/${code}`], ['Practice']),
    h('h1', 'Practice'),
    h(
      'p.muted',
      { style: { maxWidth: '64ch' } },
      learned.length
        ? `Exercises draw on the ${learned.length} words and phrases you have learned so far, and the grammar sentences from those units. Choose a unit below to focus on one topic instead.`
        : 'You have not learned any words yet, so exercises will use Unit 1. Learn words in the Course to fill your practice pool.',
    ),
    voice
      ? null
      : canSpeak(L.tts)
        ? h('div.callout', { style: { margin: '12px 0' } }, 'Listening exercises are switched off, so they are hidden. Turn them back on in ', h('a', { href: '#/account' }, 'Settings → Audio'), '.')
        : h('div.callout', { style: { margin: '12px 0' } }, `No ${L.name} voice was found on this device, so listening exercises are hidden. Install one or enable the online voice in `, h('a', { href: '#/account' }, 'Settings'), '.'),
    h(
      'div.mode-grid',
      { style: { marginTop: '16px' } },
      MODES.filter((m) => !m.hidden && (!m.audio || voice) && (!m.mic || speakingOn())).map((m) =>
        h('a.card', { href: `#/l/${code}/practice/${m.id}` }, h('span.ico', { html: ICONS[m.icon] }), h('h3', m.title), h('span.small.muted', m.desc)),
      ),
    ),
    h(
      'section.section',
      h('h2', 'Practise one unit'),
      h(
        'div.grid',
        units.map((u) => {
          const n = data.unitItems(code, u).filter((it) => store.card(code, it.key)).length;
          return h('a.card', { href: `#/l/${code}/practice/mixed?u=${u.id}` }, h('div.small.muted', `Unit ${u.id}`), h('h3', u.title), h('div.tiny.faint', `${n} of ${u.vocab.length + u.phrases.length} learned`));
        }),
      ),
    ),
  );
}

export async function practiceMode({ code, L, params, query }) {
  const mode = params[1];
  const meta = MODES.find((m) => m.id === mode);
  if (!meta) return h('div.empty', 'Unknown practice mode.');
  const { c, units, all, learned, letters, sentences, reachedSentences, lex } = await pools(code);
  const u = parseInt(query.get('u') || '0', 10);
  let pool = u ? data.unitItems(code, units[u - 1]) : learned.length >= 4 ? learned : data.unitItems(code, units[0]);
  const sentencePool = u ? data.unitSentenceItems(units[u - 1]) : reachedSentences.length >= 4 ? reachedSentences : data.unitSentenceItems(units[0]);
  const keys = scriptKeys(c);
  const root = h('div');
  const exit = () => go(`/l/${code}/practice`);
  const N = 12;
  let questions;
  let lesson = null;

  const words = pool.filter((i) => i.kind === 'word');
  const phrases = pool.filter((i) => i.kind === 'phrase');
  switch (mode) {
    case 'mixed':
      questions = shuffle([
        ...mixedQuestions(pool, all, { n: 10, kinds: ['meaning', 'listen', 'recall', 'typeRoman', 'build', 'dictation', 'speak'].filter((k) => (k !== 'speak' || (canRecognize() && speakingOn())) && ((k !== 'listen' && k !== 'dictation') || listeningOn(L.tts))) }),
        ...sentenceQuestions(sentencePool, sentences, lex, { n: 4, kinds: ['cloze', 'build', 'cloze', 'meaning'] }),
      ]);
      break;
    case 'grammar':
      questions = sentenceQuestions(sentencePool, sentences, lex, { n: 14 });
      break;
    case 'flashcards':
      questions = sample(pool, 20).map((it) => Q.flash(it, Math.random() < 0.5 ? 'en' : 'native'));
      break;
    case 'listening':
      questions = sample(pool, N).map((it) => Q.listen(it, all));
      break;
    case 'dictation':
      questions = sample(pool.filter((i) => i.roman.length < 30), N).map(Q.dictation);
      break;
    case 'translate':
      questions = sample(pool.filter((i) => i.roman.length < 34), N).map(Q.typeRoman);
      break;
    case 'typing-script':
      questions = sample(words.length >= 4 ? words : pool, 10).map((it) => Q.typeNative(it, keys));
      break;
    case 'sentences': {
      let ps = phrases.length >= 4 ? phrases : all.filter((i) => i.kind === 'phrase' && i.unit <= Math.max(2, u || 2));
      ps = ps.filter((p) => p.native.split(/\s+/).length >= 2);
      const ss = sentencePool.filter((x) => x.native.split(/\s+/).length <= 9);
      questions = shuffle([...sample(ps, 5).map((p) => Q.build(p, all)), ...sample(ss, 7).map((x) => Q.build(x, sentences))]);
      break;
    }
    case 'speaking':
      questions = sample(pool, 8).map(Q.speak);
      break;
    case 'letters': {
      // learn letters a few at a time, and keep the ones you know coming back (see letters.js)
      const g = query.get('g');
      const teach = teachable(letters).filter((l) => !g || l.group === g);
      const byKey = new Map(letters.map((l) => [l.key, l]));
      const known = letters.filter((l) => store.card(code, l.key));
      const due = store.dueCards(code).map((d) => byKey.get(d.key)).filter((l) => l && (!g || l.group === g));
      const fresh = teach.filter((l) => !store.card(code, l.key));
      if (fresh.length || due.length) {
        lesson = letterLesson({ fresh, due, known, all: teachable(letters), dir: L.dir, Q });
        questions = lesson.questions;
      } else {
        // everything learned and nothing due: a round on the letters you have found hardest
        const weakest = teach.map((l) => [store.card(code, l.key), l]).sort((a, b) => a[0].ease - b[0].ease || b[0].lapses - a[0].lapses).map((x) => x[1]);
        const pick = shuffle(weakest.slice(0, 14)).slice(0, 12);
        questions = pick.map((l, i) => (i % 2 ? Q.letterFind(l, teach) : Q.letterName(l, teach)));
      }
      break;
    }
    case 'reading-words': {
      // Real words to sound out: letter examples + early-unit vocabulary, romanization hidden.
      const ex = letters.filter((l) => l.example).map((l) => ({ ...l.example, kind: 'word' }));
      const early = all.filter((i) => i.kind === 'word' && i.unit <= 6);
      const src = shuffle([...ex, ...early]).filter((w, i, a) => a.findIndex((x) => x.native === w.native) === i);
      questions = src.slice(0, 12).map((w) => {
        const opts = shuffle([w, ...sample(src.filter((x) => x.roman !== w.roman), 3)]);
        return { type: 'mc', item: w, from: 'native', to: 'en', options: opts.map((o) => ({ ...o, en: o.roman })), answer: opts.indexOf(w), reading: true };
      });
      break;
    }
    case 'writing': {
      const base = letters.filter((l) => l.roman && [...l.char].length <= 3 && !/◌/.test(l.char));
      const seen = store.hasLang(code) ? store.lang(code).letters : {};
      const practised = base.filter((l) => seen[l.char]);
      questions = sample(practised.length >= 6 ? practised : base.slice(0, 20), 8).map(Q.write);
      // once a few letters are familiar, also write short whole words
      if (practised.length >= 10) {
        const shortWords = pool.filter((i) => i.kind === 'word' && !i.native.includes(' ') && i.native.length <= 5);
        questions = shuffle([...questions.slice(0, 6), ...sample(shortWords, 3).map((w) => Q.write({ char: w.native, roman: w.roman, sound: w.en, example: w, key: w.key }))]);
      }
      break;
    }
    case 'numbers': {
      const ns = c.numbers.filter((n) => n.n <= 100);
      questions = sample(ns, 12).map(Q.number);
      break;
    }
  }

  const title = h('div', crumbs([L.name, `#/l/${code}`], ['Practice', `#/l/${code}/practice`], [meta.title + (u ? ` · Unit ${u}` : '')]));
  const wrap = h('div', { 'data-title': meta.title }, title, root);
  runSession(root, {
    code,
    questions,
    onExit: exit,
    retry: (missed) =>
      runSession(root, {
        code,
        requeue: mode === 'letters',
        record: mode !== 'letters',
        questions: mode === 'letters' ? missed.flatMap((l) => [Q.letterIntro(l), Q.letterName(l, letters), Q.letterFind(l, letters.filter((x) => x === l || x.roman !== l.roman))]) : mixedQuestions(missed, all, { n: missed.length, kinds: ['meaning', 'recall', 'listen'] }),
        onExit: exit,
      }),
    record: !['letters', 'writing', 'reading-words', 'numbers'].includes(mode),
    requeue: mode === 'letters',
    onDone: lesson ? ({ missed }) => saveLetters(code, lesson, missed) : undefined,
    emptyText: meta.audio && !canSpeak(L.tts) ? `No ${L.name} voice is available on this device, so this exercise can't run. See Settings → Audio.` : 'Not enough material yet — learn a few words in the Course first.',
  });
  return wrap;
}

// After a letter lesson: new letters join the review deck, and reviewed ones are rescheduled.
function saveLetters(code, { newOnes, reviews }, missed) {
  const slipped = (l) => missed.some((m) => m.char === l.char);
  newOnes.forEach((l) => {
    store.ensureCard(code, l.key, { kind: 'letter', unit: null });
    store.review(code, l.key, slipped(l) ? 1 : 2);
  });
  reviews.forEach((l) => store.review(code, l.key, slipped(l) ? 0 : 2));
}

function scriptKeys(c) {
  const out = [];
  for (const g of c.script.groups) {
    if (/digit|numeral|number/i.test(g.id + g.title)) continue;
    for (const l of g.letters) {
      const ch = l.char.replace(/◌/g, '');
      if ([...ch].length === 1 && !out.includes(ch)) out.push(ch);
      if (l.sign && l.sign !== '—') {
        const s = l.sign.replace(/◌/g, '');
        if (s && [...s].length <= 2 && !out.includes(s)) out.push(s);
      }
    }
  }
  return out;
}

// ---------- learn new items from a unit ----------
export async function learnView({ code, L, params }) {
  const n = parseInt(params[1], 10);
  const part = params[2] === 'phrases' ? 'phrases' : 'words';
  const [units] = await Promise.all([data.allUnits(code)]);
  const u = units[n - 1];
  if (!u) return notFound(code, 'That unit does not exist.');
  const all = units.flatMap((x) => data.unitItems(code, x));
  const items = data.unitItems(code, u).filter((i) => i.kind === (part === 'words' ? 'word' : 'phrase'));
  // words first met as a miss in a quiz still get a proper introduction
  const fresh = items.filter((i) => !store.card(code, i.key) || store.card(code, i.key).unseen);
  const per = store.settings().newPerSession;
  const root = h('div');
  const back = () => go(`/l/${code}/u/${n}?t=${part}`);
  const voice = listeningOn(L.tts);

  let questions;
  let batch;
  if (fresh.length) {
    batch = fresh.slice(0, per);
    const pool = all;
    const qs = [];
    // introduce in small groups of 4, each followed by a quick check
    for (let i = 0; i < batch.length; i += 4) {
      const grp = batch.slice(i, i + 4);
      grp.forEach((it) => qs.push(Q.intro(it)));
      shuffle(grp).forEach((it) => qs.push(Q.meaning(it, pool)));
      shuffle(grp).forEach((it) => qs.push(part === 'phrases' && it.native.includes(' ') ? Q.build(it, pool) : voice ? Q.listen(it, pool) : Q.recall(it, pool)));
    }
    shuffle(batch).forEach((it) => qs.push(Q.recall(it, pool)));
    questions = qs;
  } else {
    questions = mixedQuestions(items, all, { n: 12 });
  }

  runSession(root, {
    code,
    learn: true,
    questions,
    onExit: back,
    doneLabel: 'Back to unit',
    onDone: ({ missed }) => {
      // Learned items enter review; ones you got right start with a short interval.
      (batch || []).forEach((it) => {
        store.ensureCard(code, it.key, { kind: it.kind, unit: it.unit });
        if (!missed.some((m) => m.native === it.native)) store.review(code, it.key, 2);
      });
      if (items.every((i) => store.card(code, i.key))) store.markUnit(code, n, part);
    },
    retry: (missed) => runSession(root, { code, questions: missed.flatMap((m) => [Q.intro(m), Q.meaning(m, all)]), onExit: back }),
  });
  return h(
    'div',
    { 'data-title': `Learn · Unit ${n}` },
    crumbs([L.name, `#/l/${code}`], [`Unit ${n}`, `#/l/${code}/u/${n}?t=${part}`], [fresh.length ? `Learn ${part}` : `Practise ${part}`]),
    fresh.length ? h('p.small.muted.center', `${batch.length} new ${part} · ${fresh.length - batch.length} more after this`) : h('p.small.muted.center', `You have learned all the ${part} in this unit — here is a practice round.`),
    root,
  );
}

// ---------- spaced-repetition review ----------
export async function reviewView({ code, L }) {
  const { all, letters, sentences, lex } = await pools(code);
  const byKey = new Map(all.map((i) => [i.key, i]));
  sentences.forEach((s) => byKey.set(s.key, s));
  letters.forEach((l) => byKey.set(l.key, { ...l, native: l.char, en: l.sound, kind: 'letter' }));
  const letterOf = new Map(letters.map((l) => [l.key, l]));
  const due = store.dueCards(code).filter((d) => byKey.has(d.key));
  const root = h('div');
  const head = crumbs([L.name, `#/l/${code}`], ['Review']);

  if (!due.length) {
    const cards = store.hasLang(code) ? Object.values(store.lang(code).cards) : [];
    const nextDue = cards.length ? Math.min(...cards.map((x) => x.due)) : null;
    const st = store.cardStats(code);
    return h(
      'div',
      { 'data-title': 'Review' },
      head,
      h(
        'div.empty',
        h('h2', cards.length ? 'All caught up' : 'Nothing to review yet'),
        h(
          'p',
          cards.length
            ? `You have ${st.total} items in your deck, ${st.mastered} of them known well. The next one is due ${relTime(nextDue)}.`
            : 'Words and phrases you learn in the Course appear here, scheduled to come back just before you would forget them.',
        ),
        h('div.row', { style: { justifyContent: 'center' } }, h('a.btn.primary', { href: `#/l/${code}` }, 'Back to course'), cards.length ? h('a.btn', { href: `#/l/${code}/practice/flashcards` }, 'Practise anyway') : null),
      ),
    );
  }
  const session = due.slice(0, 60).map((d) => {
    const it = byKey.get(d.key);
    // sentences are reviewed by using them, not by flipping a card
    if (it.kind === 'letter') return Math.random() < 0.5 ? Q.letterName(letterOf.get(d.key), letters) : Q.letterFind(letterOf.get(d.key), letters.filter((l) => l === letterOf.get(d.key) || l.roman !== letterOf.get(d.key).roman));
    if (it.kind === 'sentence') return sentenceQuestion(it, d.reps >= 2 ? (Math.random() < 0.5 ? 'build' : 'typeRoman') : Math.random() < 0.6 ? 'cloze' : 'build', sentences, lex);
    return Q.flash(it, it.kind !== 'letter' && d.reps >= 2 && Math.random() < 0.5 ? 'en' : 'native');
  });
  runSession(root, { code, type: 'review', questions: session, onExit: () => go(`/l/${code}`), doneLabel: 'Done' });
  return h('div', { 'data-title': 'Review' }, head, h('p.small.muted.center', `${due.length} due${due.length > 60 ? ' — doing the first 60' : ''}. Be honest with the grades: "Again" is not failure, it just schedules the card sooner.`), root);
}

function relTime(ts) {
  if (!ts) return 'later';
  const d = ts - Date.now();
  if (d < 36e5) return `in ${Math.max(1, Math.round(d / 6e4))} minutes`;
  if (d < 864e5) return `in ${Math.round(d / 36e5)} hours`;
  return `in ${Math.round(d / 864e5)} days`;
}

