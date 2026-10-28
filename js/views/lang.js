import { h, fill, add, md, clear, fmtMinutes, normRoman, toast, sample, go } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { nt, rm, audioBtn, itemRow, exampleRow, writingPad, ctx, ICONS } from '../components.js';
import { speak, canSpeak, stop } from '../audio.js';
import { runSession, Q, mixedQuestions, sentenceQuestions, lessonQuestions, formsRow } from '../session.js';
import { joinForms, rightJoiners, teachable } from '../letters.js';
import { weekChart, crumbs } from './shared.js';
import * as path from '../path.js';

// Units 1–20 are the foundations; from 21 on, the course is about real life and fluency.
const PARTS = [
  { from: 1, title: 'Part 1 · Foundations', desc: 'The core of the language: greetings to telling a story, each unit taught as short lessons built around full sentences.' },
  { from: 21, title: 'Part 2 · Real life & fluency', desc: 'Talking with friends, getting around town, sorting things out and sounding natural.' },
];

// ---------- language overview ----------
export async function langHome({ code, L }) {
  const [c, units] = await Promise.all([data.course(code), data.allUnits(code)]);
  const st = store.cardStats(code);
  const letters = data.scriptLetters(c);
  const seenLetters = store.hasLang(code) ? letters.filter((l) => store.lang(code).letters[l.char]).length : 0;
  const started = store.hasLang(code) && (st.total > 0 || seenLetters > 0 || Object.keys(store.lang(code).units).length > 0);

  const next = suggestNext(code, units, { st, started });
  const goal = store.settings().dailyGoal;
  const todayMin = Math.round(store.timeToday() / 60);
  const weekSec = store.timeByDay(7, code).reduce((s, d) => s + d.seconds, 0);
  const unitsDone = units.filter((u) => store.unitState(code, u.id).check).length;

  return h(
    'div',
    { 'data-title': L.name },
    h(
      'div.lang-head',
      h('div', h('div.native', nt(c.native)), h('h1', { style: { margin: 0 } }, c.name)),
      h('p.muted', { style: { flex: '1 1 300px', margin: '0 0 6px' } }, c.tagline),
    ),
    h('p.small.muted', `${L.script} script · ${c.speakers} · ${c.where}`),
    canSpeak(L.tts)
      ? null
      : h('div.callout', { style: { margin: '12px 0' } }, `There is no speech voice for ${c.name} yet, so this course has no audio. Lean on the sound descriptions in the Script and Pronunciation sections, listen to native speakers wherever you can (radio, YouTube, music), and use the speaking exercises to record and compare yourself.`),
    started
      ? h(
          'div.stat-row',
          stat(`${unitsDone}/${units.length}`, 'units finished'),
          stat(st.words, 'words learned'),
          st.sentences ? stat(st.sentences, 'sentences') : null,
          stat(st.due, 'due for review'),
          stat(fmtMinutes(weekSec), 'this week'),
        )
      : null,
    h(
      'div.card.next-card',
      { style: { marginTop: started ? 0 : '18px' } },
      h('div', h('div.small.muted', started ? 'Up next' : 'Start here'), h('h3', { style: { margin: '2px 0' } }, next.title), h('div.small.muted', next.why)),
      h('div.row', next.alt ? h('a.btn', { href: next.alt.href }, next.alt.cta) : null, h('a.btn.accent', { href: next.href }, next.cta)),
    ),
    started && goal
      ? h(
          'div',
          { style: { marginTop: '14px', maxWidth: '420px' } },
          h('div.row.between.small', h('span.muted', 'Today'), h('span.muted', `${todayMin} of ${goal} min`)),
          h('div.bar' + (todayMin >= goal ? '.good' : ''), h('i', { style: { width: `${Math.min(100, (todayMin / goal) * 100)}%` } })),
          h('p.tiny.faint', { style: { marginTop: '4px' } }, encouragement(st, todayMin, goal)),
        )
      : null,
    h(
      'section.section#units',
      h('div.section-head', h('h2', 'Course'), h('span.small.muted', `${units.length} units · ${units.reduce((s, u) => s + u.vocab.length, 0)} words`)),
      h('p.small.muted', { style: { margin: '-4px 0 14px', maxWidth: '66ch' } }, 'Work through the units in order. Each lesson starts with a quick tip on anything new, teaches a few words, then has you use them in full sentences. What you learn comes back in your reviews.'),
      PARTS.map((part, pi) => {
        const list = units.filter((u) => u.id >= part.from && (!PARTS[pi + 1] || u.id < PARTS[pi + 1].from));
        if (!list.length) return null;
        return h(
          'div.part',
          units.length > 20 ? h('div.part-head', h('h3', part.title), h('span.small.muted', part.desc)) : null,
          h('div.unit-list', list.map((u) => unitRow(code, u))),
        );
      }),
    ),
    h(
      'section.section',
      h('div.section-head', h('h2', 'Extra practice'), h('span.small.muted', 'For reviewing and going deeper')),
      h(
        'div.extra-grid',
        extra(`#/l/${code}/review`, 'refresh', 'Review', st.due ? `${st.due} due now` : 'Spaced repetition of everything you have learned'),
        extra(`#/l/${code}/practice`, 'puzzle', 'Practice', 'Flashcards, listening, typing, speaking, sentence workouts'),
        extra(`#/l/${code}/talk`, 'chat', 'Conversation', 'Role-play the dialogues, answer in your own words'),
        extra(`#/l/${code}/grammar`, 'book', 'Grammar notes', 'Every rule in one handbook, with practice'),
        extra(`#/l/${code}/script`, 'letters', 'Script', `${letters.length} letters, ${seenLetters} practised`),
        extra(`#/l/${code}/sounds`, 'ear', 'Pronunciation', `${c.pronunciation.length} lessons on the hard sounds`),
      ),
    ),
    h('details.about', { style: { marginTop: '22px' }, open: !started }, h('summary', `About ${c.name}`), md(c.intro), h('h3', 'Reading the romanization'), md(c.romanizationNote)),
    started ? h('section.section', h('div.card', h('div.row.between', h('strong', `${c.name} — last 14 days`), h('span.small.muted', `${fmtMinutes(store.totalTime(code))} in total`)), weekChart(store.timeByDay(14, code)))) : null,
  );
}

const extra = (href, ico, title, desc) => h('a.card.extra', { href }, h('span.ico', { html: ICONS[ico] }), h('div', h('strong', title), h('div.tiny.muted', desc)));

function unitRow(code, u) {
  const lessons = data.unitLessons(code, u);
  const p = path.unitProgress(code, u, lessons);
  const open = path.unitOpen(code, u.id);
  return h(
    'a.unit-row' + (p.complete ? '.done' : p.done ? '.started' : open ? '' : '.locked'),
    { href: `#/l/${code}/u/${u.id}` },
    h('span.unit-num', p.complete ? '✓' : open ? u.id : h('span', { html: LOCK })),
    h('div', h('div.t', u.title), h('div.g', u.goal)),
    h('div.unit-prog', { title: `${p.done} of ${p.total} steps done` }, p.done && !p.complete ? h('span.tiny.muted', `${p.done}/${p.total}`) : null, h('div.bar.good.mini', h('i', { style: { width: `${(p.done / p.total) * 100}%` } }))),
  );
}
const LOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const stat = (b, s) => h('div.stat', h('b', b), h('span', s));

function encouragement(st, todayMin, goal) {
  if (todayMin >= goal) return 'That is your time for today. Anything more is a bonus.';
  if (todayMin > 0) return 'Every few minutes counts — short, regular sessions beat long rare ones.';
  if (st.due) return `A quick review of ${st.due} item${st.due === 1 ? '' : 's'} is a good way to start.`;
  return 'No pressure — pick up wherever you like.';
}

function suggestNext(code, units, { st, started }) {
  const at = path.nextInCourse(code, units);
  const review = st.due ? { href: `#/l/${code}/review`, cta: `Review ${st.due}` } : null;
  if (!started) {
    const l = data.unitLessons(code, units[0])[0];
    return {
      title: `Unit 1 · Lesson 1: ${l.title}`,
      why: `Each lesson teaches a few words and one idea, then has you use them in full sentences straight away. Everything comes with romanization, so you can start speaking before you read the ${ctx.lang.script} script.`,
      href: path.stepHref(code, 1, 'l1'),
      cta: 'Start',
      alt: { href: `#/l/${code}/script`, cta: 'Learn the script first' },
    };
  }
  // a long review queue comes first: new lessons on top of it would only make it longer
  if (st.due >= 25) return { title: `Review ${st.due} items`, why: 'These are right on the edge of being forgotten. Clear them first, then carry on with the course.', href: `#/l/${code}/review`, cta: 'Review now', alt: at?.step ? { href: path.stepHref(code, at.u.id, at.step), cta: 'Skip to the course' } : null };
  if (at && at.step) {
    const l = at.step.startsWith('l') ? at.lessons[+at.step.slice(1) - 1] : null;
    return {
      title: `Unit ${at.u.id} · ${path.stepLabel(at.step, at.lessons, at.u)}`,
      why: l?.tip ? `New: ${l.tip.title}.` : at.step === 'talk' ? 'Hear the words of this unit in a real conversation, then practise its lines.' : at.step === 'check' ? 'Pass with 70% to finish the unit and open the next one.' : at.u.goal,
      href: path.stepHref(code, at.u.id, at.step),
      cta: at.step === 'check' ? 'Take the check' : 'Start',
      alt: review,
    };
  }
  if (at && !at.step) return { title: `Unit ${at.u.id}: take the check`, why: 'Every step is done — pass the check to finish the unit.', href: path.stepHref(code, at.u.id, 'check'), cta: 'Take the check', alt: review };
  const locked = units.find((u) => !store.unitState(code, u.id).check);
  if (locked) return { title: `Unit ${locked.id - 1}: take the check`, why: `Unit ${locked.id} opens once you pass the Unit ${locked.id - 1} check.`, href: path.stepHref(code, locked.id - 1, 'check'), cta: 'Take the check', alt: review };
  if (st.due) return { title: `Review ${st.due} items`, why: 'You have finished every unit. Keep your words and sentences fresh.', href: `#/l/${code}/review`, cta: 'Review', alt: { href: `#/l/${code}/talk`, cta: 'Conversation' } };
  return { title: 'Conversation practice', why: 'You have finished the course. Keep talking: role-play the dialogues and answer questions in your own words.', href: `#/l/${code}/talk`, cta: 'Start', alt: { href: `#/l/${code}/practice/grammar`, cta: 'Sentence workout' } };
}

// ---------- unit: the path through it ----------
async function loadUnit(code, L, n) {
  if (!(n >= 1 && n <= L.units)) return null;
  const [units, lex] = await Promise.all([data.allUnits(code), data.lexicon(code)]);
  const u = units[n - 1];
  return { units, lex, u, lessons: data.unitLessons(code, u), sentencePool: units.flatMap((x) => data.unitSentenceItems(x)), pool: units.flatMap((x) => data.unitItems(code, x)) };
}

export async function unitView({ code, L, params, query }) {
  const n = parseInt(params[1], 10);
  // links from before the path: the old tabs
  const t = query.get('t');
  if (t === 'check' || t === 'dialogue') return go(`/l/${code}/u/${n}/${t === 'check' ? 'check' : 'talk'}`), null;
  const d = await loadUnit(code, L, n);
  if (!d) return notFound(code, 'That unit does not exist.');
  const { u, lessons } = d;
  const open = path.unitOpen(code, n);
  const nextStep = path.nextStepIn(code, u, lessons);
  const all = path.steps(lessons);

  const step = (s, i) => {
    const done = path.stepDone(code, n, s);
    const can = open && path.stepOpen(code, u, lessons, s);
    const isNext = open && s === nextStep;
    const l = s.startsWith('l') ? lessons[+s.slice(1) - 1] : null;
    const title = l ? l.title : s === 'talk' ? 'Conversation' : 'Unit check';
    const sub = l
      ? [l.tip ? h('span.tip-chip', l.notes ? 'New rule: ' : 'Tip: ', l.tip.title) : null, h('span.tiny.muted', `${l.items.length} new · ${l.sentences.length} sentences`)]
      : s === 'talk'
        ? h('span.small.muted', `${u.dialogue.title} — listen, then practise its lines`)
        : h('span.small.muted', store.unitState(code, n).check ? 'Passed. Retake it any time.' : 'Pass with 70% to finish the unit. Already know this? Take it now to skip ahead.');
    const inner = [h('span.step-num', done ? '✓' : can ? (l ? l.n : s === 'talk' ? h('span', { html: ICONS.chat }) : h('span', { html: ICONS.check })) : h('span', { html: LOCK })), h('div.step-body', h('div.t', title), h('div.step-sub', sub))];
    return can ? h('a.path-step' + (done ? '.done' : '') + (isNext ? '.next' : ''), { href: path.stepHref(code, n, s) }, inner) : h('div.path-step.locked', { title: 'Finish the step before this one first' }, inner);
  };

  const notes = h(
    'section.section#notes',
    h('div.section-head', h('h2', 'Unit notes'), h('span.small.muted', 'Everything in this unit, to look back on')),
    md(u.intro),
    h(
      'details.about',
      h('summary', `Grammar (${u.grammar.length})`),
      u.grammar.map((g, gi) => h('div.grammar', h('h3', g.title), md(g.body), h('div.examples', g.examples.map(exampleRow)), h('a.small', { href: `#/l/${code}/grammar/${n}-${gi + 1}` }, 'Practise this rule →'))),
    ),
    h('details.about', h('summary', `Words (${u.vocab.length})`), h('div.items', data.unitItems(code, u).filter((i) => i.kind === 'word').map((it) => itemRow(it)))),
    h('details.about', h('summary', `Phrases (${u.phrases.length})`), h('div.items', data.unitItems(code, u).filter((i) => i.kind === 'phrase').map((it) => itemRow(it, { phrase: true })))),
    u.culture ? h('div.callout', { style: { marginTop: '14px' } }, h('strong', 'Culture & usage. '), md(u.culture)) : null,
  );

  return h(
    'div',
    { 'data-title': `Unit ${n}: ${u.title}` },
    crumbs([L.name, `#/l/${code}`], ['Course', `#/l/${code}?to=units`], [`Unit ${n}`]),
    h('div.small.muted', `Unit ${n} of ${L.units}`),
    h('h1', { style: { marginTop: '2px' } }, u.title),
    h('p.muted', u.goal),
    open
      ? nextStep
        ? h('div.row', { style: { margin: '6px 0 4px' } }, h('a.btn.primary', { href: path.stepHref(code, n, nextStep) }, all.indexOf(nextStep) === 0 ? 'Start the unit' : 'Continue: ' + path.stepLabel(nextStep, lessons, u)))
        : h('p.small', { style: { color: 'var(--good)' } }, '✓ Unit complete. Every lesson stays open for practice.')
      : h(
          'div.callout',
          { style: { margin: '10px 0' } },
          h('strong', 'This unit builds on Unit ' + (n - 1) + '. '),
          `Finish it first — or, if you already know it, pass its check to open this one.`,
          h('div.row', { style: { marginTop: '10px' } }, h('a.btn.small', { href: `#/l/${code}/u/${n - 1}` }, `Go to Unit ${n - 1}`), h('a.btn.small.primary', { href: path.stepHref(code, n - 1, 'check') }, `Unit ${n - 1} check`)),
        ),
    h('div.path', all.map(step)),
    notes,
    h('hr'),
    h(
      'div.row.between',
      n > 1 ? h('a.btn.ghost', { href: `#/l/${code}/u/${n - 1}` }, '← Unit ' + (n - 1)) : h('span'),
      n < L.units ? h('a.btn.ghost', { href: `#/l/${code}/u/${n + 1}` }, 'Unit ' + (n + 1) + ' →') : h('span'),
    ),
  );
}

// After a step: on to the next one in the unit, or back to the course when the unit is done.
function afterStep(code, d, n) {
  const s = path.nextStepIn(code, d.u, d.lessons);
  if (s) return { href: path.stepHref(code, n, s), label: 'Next: ' + (s === 'talk' ? 'Conversation' : s === 'check' ? 'Unit check' : `Lesson ${s.slice(1)}`) };
  return n < ctx.lang.units ? { href: `#/l/${code}/u/${n + 1}`, label: `On to Unit ${n + 1}` } : { href: `#/l/${code}`, label: 'Back to the course' };
}

// Cards for what a lesson taught: right first time → a first short interval; missed → due now.
function saveLearned(code, list, missed) {
  for (const it of list) {
    const c = store.ensureCard(code, it.key, { kind: it.kind, unit: it.unit });
    delete c.unseen;
    if (!c.reps && !missed.some((m) => m.native === it.native)) store.review(code, it.key, 2);
  }
}

export async function lessonView({ code, L, params }) {
  const n = parseInt(params[1], 10);
  const d = await loadUnit(code, L, n);
  if (!d) return notFound(code, 'That unit does not exist.');
  const k = parseInt(params[2], 10);
  const lesson = d.lessons[k - 1];
  if (!lesson) return notFound(code, 'That lesson does not exist.');
  const root = h('div');
  const back = () => go(`/l/${code}/u/${n}`);
  runSession(root, {
    code,
    learn: true,
    requeue: true,
    questions: lessonQuestions(lesson, d),
    onExit: back,
    onContinue: () => (location.hash = afterStep(code, d, n).href),
    doneLabel: 'Continue',
    onDone: ({ missed }) => {
      saveLearned(code, [...lesson.items, ...lesson.sentences], missed);
      store.markUnit(code, n, 'l' + k);
      const btn = root.querySelector('.session .btn.primary:last-child');
      if (btn) btn.textContent = afterStep(code, d, n).label;
    },
  });
  return h(
    'div',
    { 'data-title': `${lesson.title} · Unit ${n}` },
    crumbs([L.name, `#/l/${code}`], [`Unit ${n}`, `#/l/${code}/u/${n}`], [`Lesson ${k} of ${d.lessons.length}`]),
    h('p.small.muted.center', { style: { margin: '0 0 4px' } }, lesson.title),
    root,
  );
}

export async function unitTalkView({ code, L, params }) {
  const n = parseInt(params[1], 10);
  const d = await loadUnit(code, L, n);
  if (!d) return notFound(code, 'That unit does not exist.');
  const { u } = d;
  const lines = data.unitSentenceItems(u).filter((s) => s.lesson == null && s.grammar == null);
  const area = h('div');
  const practise = () => {
    stop();
    runSession(area, {
      code,
      learn: true,
      requeue: true,
      questions: sentenceQuestions(lines, d.sentencePool, d.lex, { n: Math.min(8, lines.length), kinds: ['listenBuild', 'meaning', 'build', 'cloze', 'typeRoman'] }),
      onExit: () => clear(area),
      onContinue: () => (location.hash = afterStep(code, d, n).href),
      doneLabel: 'Continue',
      onDone: ({ missed }) => {
        saveLearned(code, lines, missed);
        store.markUnit(code, n, 'talk');
      },
    });
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return h(
    'div',
    { 'data-title': `Conversation · Unit ${n}` },
    crumbs([L.name, `#/l/${code}`], [`Unit ${n}`, `#/l/${code}/u/${n}`], ['Conversation']),
    h('p.small.muted', 'Listen to the whole conversation first — you know nearly every word in it now. Then hide the English, read it again, and practise the lines.'),
    dialogueBlock(u.dialogue),
    h(
      'div.card.next-card',
      { style: { marginTop: '20px' } },
      h('div', h('h3', { style: { margin: '0 0 2px' } }, 'Practise the lines'), h('div.small.muted', 'Hear them and build them, understand them, and say them in your own words.')),
      h('div.row', h('a.btn', { href: `#/l/${code}/talk/${n}` }, 'Role-play it'), h('button.btn.primary', { onclick: practise }, path.stepDone(code, n, 'talk') ? 'Practise again' : 'Practise')),
    ),
    area,
  );
}

export async function unitCheckView({ code, L, params }) {
  const n = parseInt(params[1], 10);
  const d = await loadUnit(code, L, n);
  if (!d) return notFound(code, 'That unit does not exist.');
  const { u, lex } = d;
  const items = data.unitItems(code, u);
  const sentences = data.unitSentenceItems(u);
  const ownLessons = sentences.filter((s) => s.lesson != null);
  const pane = h('div');
  const intro = () =>
    fill(
      pane,
      h(
        'div.card',
        { style: { maxWidth: '560px' } },
        h('h2', `Unit ${n} check`),
        h('p.muted', `15 questions on this unit, mostly full sentences. Score 70% or more to finish Unit ${n}${n < L.units ? ` and open Unit ${n + 1}` : ''}. Whatever you miss goes into your reviews.`),
        store.unitState(code, n).check ? h('p.small', { style: { color: 'var(--good)' } }, '✓ Passed. You can retake it any time.') : null,
        h('button.btn.primary', { onclick: start }, 'Start the check'),
      ),
    );
  function start() {
    const words = items.filter((i) => i.kind === 'word');
    const phrases = items.filter((i) => i.kind === 'phrase');
    const qs = [
      ...mixedQuestions(words, d.pool, { n: 4, kinds: ['meaning', 'recall', 'listen', 'typeRoman'] }),
      ...mixedQuestions(phrases, d.pool, { n: 2, kinds: ['build', 'listen'] }),
      ...sentenceQuestions(ownLessons.length >= 9 ? ownLessons : sentences, d.sentencePool, lex, { n: 9, kinds: ['cloze', 'build', 'meaning', 'cloze', 'listenBuild', 'typeRoman'] }),
    ];
    runSession(pane, {
      code,
      questions: qs,
      onExit: intro,
      onContinue: () => (location.hash = store.unitState(code, n).check && n < L.units ? `#/l/${code}/u/${n + 1}` : `#/l/${code}/u/${n}`),
      retry: (missed) => runSession(pane, { code, questions: mixedQuestions(missed, d.pool, { n: missed.length }), onExit: intro }),
      onDone: ({ pct }) => {
        if (pct >= 70) store.markUnit(code, n, 'check');
        const btn = pane.querySelector('.session .btn.primary:last-child');
        if (btn) btn.textContent = pct >= 70 ? (n < L.units ? `On to Unit ${n + 1}` : 'Done') : 'Back to the unit';
        if (pct < 70) {
          const p = pane.querySelector('.session .center p');
          if (p) p.textContent = `You need 70% to pass. Go over the lessons you found hard, then try again — the questions change each time.`;
        }
      },
      doneLabel: 'Continue',
    });
  }
  intro();
  return h('div', { 'data-title': `Check · Unit ${n}` }, crumbs([L.name, `#/l/${code}`], [`Unit ${n}`, `#/l/${code}/u/${n}`], ['Check']), pane);
}

// ---------- dialogue reader ----------
export function dialogueBlock(d) {
  let showRoman = store.settings().roman !== 'hide';
  let showEn = true;
  let playing = false;
  const lines = d.lines.map((l) =>
    h(
      'div.line',
      h('div.speaker', l.speaker || ''),
      h('div', nt(l.native), h('div.roman' + (showRoman ? '' : '.hide'), store.settings().roman === 'tap' ? rm(l.roman) : l.roman), h('div.en.small' + (showEn ? '' : '.hide'), l.en)),
      audioBtn(l.native, { size: 'sm' }),
    ),
  );
  const toggle = (label, get, set, cls) => {
    const b = h('button.btn.small' + (get() ? '' : '.ghost'), label);
    b.onclick = () => {
      set(!get());
      b.classList.toggle('ghost', !get());
      lines.forEach((ln) => ln.querySelector(cls).classList.toggle('hide', !get()));
    };
    return b;
  };
  async function playAll(shadow) {
    if (playing) {
      playing = false;
      stop();
      return;
    }
    if (!canSpeak(ctx.lang.tts)) return toast(`No ${ctx.lang.name} voice available — see Settings → Audio.`);
    playing = true;
    for (let i = 0; i < d.lines.length && playing; i++) {
      lines.forEach((ln) => ln.classList.remove('active'));
      lines[i].classList.add('active');
      lines[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await speak(d.lines[i].native, ctx.lang.tts);
      if (shadow && playing) await new Promise((r) => setTimeout(r, 900 + d.lines[i].native.length * 110));
      else await new Promise((r) => setTimeout(r, 350));
      if (!lines[0].isConnected) playing = false;
    }
    lines.forEach((ln) => ln.classList.remove('active'));
    playing = false;
  }
  return h(
    'div',
    h('h2', d.title),
    d.setting ? h('p.muted', d.setting) : null,
    h(
      'div.row',
      { style: { margin: '10px 0' } },
      h('button.btn.small.primary', { onclick: () => playAll(false) }, 'Play all'),
      h('button.btn.small', { onclick: () => playAll(true), title: 'Pauses after each line so you can repeat it aloud' }, 'Shadowing mode'),
      toggle('Romanization', () => showRoman, (v) => (showRoman = v), '.roman'),
      toggle('English', () => showEn, (v) => (showEn = v), '.en'),
    ),
    h('p.tiny.faint', 'Shadowing: listen to each line and say it aloud in the pause, matching the rhythm. Then hide the English and read it again.'),
    h('div.dialogue', lines),
  );
}

// ---------- script ----------
export async function scriptView({ code, L }) {
  const c = await data.course(code);
  const seen = store.hasLang(code) ? store.lang(code).letters : {};
  const letters = data.scriptLetters(c);
  const teach = teachable(letters);
  const learnedN = store.hasLang(code) ? teach.filter((l) => store.card(code, l.key)).length : 0;
  const dueN = store.hasLang(code) ? teach.filter((l) => store.card(code, l.key)?.due <= Date.now()).length : 0;
  const joiners = rightJoiners(letters, L.dir);
  const joinSample = letters.filter((l) => joinForms(l, L.dir)?.joins === 'both' && /^[بجسع]$/.test(l.char));
  let idx = 0;
  return h(
    'div',
    { 'data-title': `${L.script} script` },
    crumbs([L.name, `#/l/${code}`], ['Script']),
    h('h1', `The ${L.script} script`),
    h(
      'div.row',
      { style: { marginBottom: '14px' } },
      h('a.btn.primary', { href: `#/l/${code}/practice/letters` }, learnedN ? (dueN ? `Learn letters · ${dueN} to review` : 'Learn more letters') : 'Learn letters'),
      h('a.btn', { href: `#/l/${code}/practice/writing` }, 'Handwriting practice'),
      h('a.btn', { href: `#/l/${code}/practice/reading-words` }, 'Read real words'),
      h('button.btn.ghost', { onclick: () => window.print() }, 'Print chart'),
    ),
    h('p.small.muted', learnedN ? `${learnedN} of ${teach.length} letters learned${dueN ? ` · ${dueN} due for review` : ''}. A lesson teaches a few new ones and brings back the ones you know.` : `${teach.length} letters and signs. A lesson introduces a few at a time and tests each one straight away.`),
    h('details.about', { open: !Object.keys(seen).length }, h('summary', 'How the script works'), md(c.script.overview)),
    joiners.length
      ? h(
          'details.about',
          { open: true },
          h('summary', 'How letters join'),
          h('p', `${L.script} is written right to left, and most letters join to the letter after them. A joining letter has up to four shapes — on its own, at the start of a word, in the middle and at the end — but its core shape (the part with the dots) stays the same, so you recognise it by that. For example:`),
          h('div.forms-examples', joinSample.map((l) => h('a.forms-example', { href: `#/l/${code}/script/${letters.indexOf(l)}` }, formsRow(joinForms(l, L.dir)), h('span.small.muted', l.roman)))),
          h('p', 'These letters join only to the letter before them, never to the one after, so a word breaks into pieces after them: ', h('span.nt-inline', joiners.map((l) => h('a', { href: `#/l/${code}/script/${letters.indexOf(l)}`, style: { textDecoration: 'none' } }, nt(l.char))).flatMap((x) => [x, ' ']))),
          h('p.small.muted', 'Open any letter to see all its shapes. Lessons for these scripts include questions on the joined shapes.'),
        )
      : null,
    c.script.groups.map((g) => {
      const start = idx;
      idx += g.letters.length;
      return h(
        'section.section',
        { id: 'g-' + g.id },
        h('div.section-head', h('h2', g.title), h('a.small.muted', { href: `#/l/${code}/practice/letters?g=${g.id}` }, 'Drill this group')),
        g.note ? md(g.note) : null,
        h(
          'div.letters',
          g.letters.map((l, j) =>
            h('a.letter' + (seen[l.char] ? '.seen' : ''), { href: `#/l/${code}/script/${start + j}`, style: { textDecoration: 'none' } }, nt(l.char), h('span.r', l.roman || '—')),
          ),
        ),
      );
    }),
    h('p.small.faint', { style: { marginTop: '24px' } }, 'A green dot marks letters you have practised.'),
  );
}

export async function letterView({ code, L, params }) {
  const c = await data.course(code);
  const letters = data.scriptLetters(c);
  const i = Math.min(letters.length - 1, Math.max(0, parseInt(params[1], 10)));
  const l = letters[i];
  store.markLetter(code, l.char);
  const pad = writingPad(l.char);
  const guideBtn = h('button.btn.small', 'Hide guide');
  guideBtn.onclick = () => (guideBtn.textContent = pad.toggleGuide() ? 'Hide guide' : 'Show guide');
  const scoreEl = h('span.small.muted');
  const speakable = l.char.replace(/◌/g, '');
  return h(
    'div',
    { 'data-title': `${l.char} (${l.roman})` },
    crumbs([L.name, `#/l/${code}`], ['Script', `#/l/${code}/script?to=g-${l.group}`], [l.groupTitle]),
    h(
      'div.letter-detail',
      h(
        'div',
        h('div.card', h('div.big-glyph', nt(l.char)), h('div.row', { style: { justifyContent: 'center' } }, audioBtn(speakable), audioBtn(speakable, { slow: true }))),
        h(
          'dl.kv',
          { style: { marginTop: '18px' } },
          h('dt', 'Romanization'),
          h('dd', h('strong', l.roman || '—')),
          l.ipa ? [h('dt', 'IPA'), h('dd', `/${l.ipa}/`)] : null,
          h('dt', 'Sound'),
          h('dd', l.sound),
          joinForms(l, L.dir) ? [h('dt', 'Shapes'), h('dd', formsRow(joinForms(l, L.dir)), joinForms(l, L.dir).joins === 'right' ? h('div.small.muted', 'Joins only to the letter before it — the next letter starts fresh.') : joinForms(l, L.dir).joins === 'end' ? h('div.small.muted', 'Only written at the end of a word.') : null)] : null,
          l.sign ? [h('dt', 'Vowel sign'), h('dd', nt(l.sign), l.signExample ? h('span.muted', '  e.g. ', nt(l.signExample.split(' ')[0]), ' ', l.signExample.split(' ').slice(1).join(' ')) : null)] : null,
        ),
        l.example ? h('div', { style: { marginTop: '16px' } }, h('div.small.muted', { style: { marginBottom: '6px' } }, 'Example'), itemRow(l.example)) : null,
      ),
      h(
        'div',
        h('h3', 'Write it'),
        l.strokes ? h('p.small.muted', l.strokes) : h('p.small.muted', 'Trace over the grey guide, then hide it and try from memory.'),
        pad.el,
        h(
          'div.row',
          { style: { marginTop: '10px' } },
          h('button.btn.small', { onclick: () => pad.undo() }, 'Undo'),
          h('button.btn.small', { onclick: () => (pad.clear(), (scoreEl.textContent = '')) }, 'Clear'),
          guideBtn,
          h(
            'button.btn.small.primary',
            {
              onclick: () => {
                const s = pad.score();
                scoreEl.textContent = s == null ? 'Draw something first.' : `Overlap with the model: ${s}% ${s >= 60 ? '— nice.' : s >= 40 ? '— close.' : '— compare with the guide.'}`;
              },
            },
            'Check',
          ),
        ),
        scoreEl,
      ),
    ),
    h('hr'),
    h(
      'div.row.between',
      i > 0 ? h('a.btn.ghost', { href: `#/l/${code}/script/${i - 1}` }, '← ', nt(letters[i - 1].char)) : h('span'),
      h('a.btn.ghost.small', { href: `#/l/${code}/script?to=g-${l.group}` }, 'All letters'),
      i < letters.length - 1 ? h('a.btn.ghost', { href: `#/l/${code}/script/${i + 1}` }, nt(letters[i + 1].char), ' →') : h('span'),
    ),
  );
}

// ---------- pronunciation ----------
export async function soundsView({ code, L }) {
  const c = await data.course(code);
  const seen = store.hasLang(code) ? store.lang(code).sounds : {};
  return h(
    'div',
    { 'data-title': 'Pronunciation' },
    crumbs([L.name, `#/l/${code}`], ['Pronunciation']),
    h('h1', 'Pronunciation'),
    h('p.muted', { style: { maxWidth: '64ch' } }, `The sounds of ${c.name} that English speakers most often get wrong — and how to get them right. Each lesson has an explanation, minimal pairs (words that differ by just that sound), ear training and speaking practice.`),
    h(
      'div.callout',
      { style: { margin: '16px 0 24px', maxWidth: '72ch' } },
      h('strong', 'How to practise. '),
      'Listen to a pair several times until you can hear the difference, then do the ear training. Only then try saying them — record yourself and compare. Your ear has to learn a sound before your mouth can.',
    ),
    h(
      'div.unit-list',
      c.pronunciation.map((p, i) =>
        h(
          'a.unit-row' + (seen[p.id] ? '.done' : ''),
          { href: `#/l/${code}/sounds/${p.id}` },
          h('span.unit-num', seen[p.id] ? '✓' : i + 1),
          h('div', h('div.t', p.title), h('div.g', `${(p.pairs || []).length} pairs · ${(p.drill || []).length} drill items`)),
          h('span'),
        ),
      ),
    ),
  );
}

export async function soundView({ code, L, params }) {
  const c = await data.course(code);
  const idx = c.pronunciation.findIndex((p) => p.id === params[1]);
  const p = c.pronunciation[idx];
  if (!p) return h('div.empty', 'Lesson not found.');
  store.markSound(code, p.id);
  const area = h('div');
  const pairs = p.pairs || [];
  const drill = p.drill || [];
  const allPairItems = pairs.flatMap((pr) => [pr.a, pr.b]);
  // pairs spelled identically can't be told apart by synthesized audio
  const earPairs = pairs.filter((pr) => pr.a.native.trim() !== pr.b.native.trim());
  const ear = () =>
    runSession(area, {
      code,
      record: false,
      questions: Array.from({ length: Math.min(10, earPairs.length * 3) }, (_, i) => Q.pair(earPairs[i % earPairs.length])).sort(() => Math.random() - 0.5),
      onExit: () => (clear(area), area.scrollIntoView({ behavior: 'smooth' })),
      doneLabel: 'Close',
    });
  const speakIt = () =>
    runSession(area, {
      code,
      record: false,
      questions: [...drill, ...allPairItems].slice(0, 10).map(Q.speak),
      onExit: () => clear(area),
      doneLabel: 'Close',
    });
  return h(
    'div',
    { 'data-title': p.title },
    crumbs([L.name, `#/l/${code}`], ['Pronunciation', `#/l/${code}/sounds`], [p.title]),
    h('h1', p.title),
    md(p.body),
    p.tips?.length ? h('div.callout.accent', { style: { margin: '16px 0', maxWidth: '72ch' } }, h('strong', 'Tips'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '1.2em' } }, p.tips.map((t) => h('li', t)))) : null,
    pairs.length
      ? h(
          'section.section',
          h('div.section-head', h('h2', 'Minimal pairs'), earPairs.length ? h('button.btn.primary.small', { onclick: ear }, 'Ear training') : null),
          pairs.map((pr) =>
            h(
              'div.pair',
              ['a', 'b'].map((s) => h('div.side', audioBtn(pr[s].native), h('div', h('div', nt(pr[s].native), ' ', rm(pr[s].roman, 'show')), h('div.small.muted', pr[s].en)))),
              pr.note ? h('div.pair-note', pr.note) : null,
            ),
          ),
        )
      : null,
    drill.length ? h('section.section', h('div.section-head', h('h2', 'Drill'), h('button.btn.small', { onclick: speakIt }, 'Speaking practice')), h('div.items', drill.map((d) => itemRow(d)))) : null,
    area,
    h('hr'),
    h(
      'div.row.between',
      idx > 0 ? h('a.btn.ghost', { href: `#/l/${code}/sounds/${c.pronunciation[idx - 1].id}` }, '← ' + c.pronunciation[idx - 1].title) : h('span'),
      idx < c.pronunciation.length - 1 ? h('a.btn.ghost', { href: `#/l/${code}/sounds/${c.pronunciation[idx + 1].id}` }, c.pronunciation[idx + 1].title + ' →') : h('span'),
    ),
  );
}

// ---------- reading room ----------
export async function readingView({ code, L, query }) {
  const units = await data.allUnits(code);
  const sel = parseInt(query.get('u') || '0', 10);
  if (sel) {
    const u = units[sel - 1];
    if (!u) return notFound(code, 'That reading does not exist.');
    return h(
      'div',
      { 'data-title': u.dialogue.title },
      crumbs([L.name, `#/l/${code}`], ['Reference', `#/l/${code}/reference`], ['Reading', `#/l/${code}/reading`], [u.dialogue.title]),
      dialogueBlock(u.dialogue),
      h('hr'),
      h(
        'div.row.between',
        sel > 1 ? h('a.btn.ghost', { href: `#/l/${code}/reading?u=${sel - 1}` }, '← Previous') : h('span'),
        h('a.btn.ghost.small', { href: `#/l/${code}/u/${sel}` }, `Unit ${sel} lesson`),
        sel < units.length ? h('a.btn.ghost', { href: `#/l/${code}/reading?u=${sel + 1}` }, 'Next →') : h('span'),
      ),
    );
  }
  return h(
    'div',
    { 'data-title': 'Reading' },
    crumbs([L.name, `#/l/${code}`], ['Reference', `#/l/${code}/reference`], ['Reading']),
    h('h1', 'Reading room'),
    h('p.muted', { style: { maxWidth: '64ch' } }, 'All the dialogues from the course in one place, from simplest to hardest. Read them in the script, listen, then shadow them aloud. Try hiding the romanization and English once you know a text.'),
    h(
      'div.unit-list',
      units.map((u) =>
        h(
          'a.unit-row',
          { href: `#/l/${code}/reading?u=${u.id}` },
          h('span.unit-num', u.id),
          h('div', h('div.t', u.dialogue.title), h('div.g', nt(u.dialogue.lines[0].native))),
          h('span.small.muted', `${u.dialogue.lines.length} lines`),
        ),
      ),
    ),
  );
}

// ---------- reference ----------
export async function referenceView({ code, L }) {
  const c = await data.course(code);
  return h(
    'div',
    { 'data-title': 'Reference' },
    crumbs([L.name, `#/l/${code}`], ['Reference']),
    h('h1', 'Reference'),
    h(
      'div.grid',
      h('a.card', { href: `#/l/${code}/grammar` }, h('h3', 'Grammar notes'), h('p.small.muted', 'Every rule in the course in one handbook, grouped by topic, each with sentence practice.')),
      h('a.card', { href: `#/l/${code}/glossary` }, h('h3', 'Glossary'), h('p.small.muted', 'Search every word and phrase in the course, in English, romanization or script.')),
      h('a.card', { href: `#/l/${code}/numbers` }, h('h3', 'Numbers'), h('p.small.muted', '0–100 and the big ones, with audio.')),
      h('a.card', { href: `#/l/${code}/reading` }, h('h3', 'Reading room'), h('p.small.muted', 'All the dialogues in one place, to read, listen to and shadow.')),
    ),
    h('section.section', h('h2', 'Romanization in this course'), md(c.romanizationNote)),
  );
}

export async function numbersView({ code, L }) {
  const c = await data.course(code);
  return h(
    'div',
    { 'data-title': 'Numbers' },
    crumbs([L.name, `#/l/${code}`], ['Reference', `#/l/${code}/reference`], ['Numbers']),
    h('div.row.between', h('h1', { style: { margin: 0 } }, 'Numbers'), canSpeak(L.tts) ? h('a.btn.primary', { href: `#/l/${code}/practice/numbers` }, 'Listening practice') : null),
    h('p.muted', { style: { maxWidth: '64ch' } }, 'Tap any number to hear it. Numbers up to 100 are worth learning in chunks of ten — many are irregular, so there is no shortcut, but you will hear them constantly (prices, times, phone numbers).'),
    h(
      'div.num-table',
      c.numbers.map((n) =>
        h(
          'div.num',
          { onclick: () => canSpeak(L.tts) && speak(n.native, L.tts), title: 'Listen' },
          h('span.n', n.n >= 1000 ? n.n.toLocaleString('en-IN') : n.n, n.digit && n.digit !== String(n.n) ? h('div.nt.tiny', n.digit) : null),
          nt(n.native),
          rm(n.roman),
          n.note ? h('span.tiny.faint', { style: { gridColumn: '1 / -1' } }, n.note) : null,
        ),
      ),
    ),
  );
}

export async function glossaryView({ code, L, query }) {
  const units = await data.allUnits(code);
  const all = units.flatMap((u) => data.unitItems(code, u));
  const input = h('input', { type: 'search', placeholder: 'Search in English, romanization or script…', value: query.get('q') || '', autofocus: true });
  const kind = h('select', { style: { width: 'auto' } }, h('option', { value: '' }, 'Words & phrases'), h('option', { value: 'word' }, 'Words'), h('option', { value: 'phrase' }, 'Phrases'));
  const out = h('div.items');
  const count = h('p.small.muted');
  function update() {
    const q = input.value.trim().toLowerCase();
    const qr = normRoman(q);
    const res = all.filter((it) => (!kind.value || it.kind === kind.value) && (!q || it.en.toLowerCase().includes(q) || it.native.includes(input.value.trim()) || (qr && normRoman(it.roman).includes(qr))));
    count.textContent = `${res.length} result${res.length === 1 ? '' : 's'}`;
    fill(out, 
      res.slice(0, 200).map((it) => itemRow(it, { phrase: it.kind === 'phrase', extra: h('a.tiny.faint', { href: `#/l/${code}/u/${it.unit}` }, `Unit ${it.unit}`) })),
    );
  }
  input.oninput = update;
  kind.onchange = update;
  update();
  return h('div', { 'data-title': 'Glossary' }, crumbs([L.name, `#/l/${code}`], ['Reference', `#/l/${code}/reference`], ['Glossary']), h('h1', 'Glossary'), h('div.row', { style: { flexWrap: 'nowrap' } }, input, kind), count, out);
}


export const notFound = (code, msg) => h('div.empty', h('h2', 'Not found'), h('p', msg), h('a.btn', { href: `#/l/${code}` }, 'Back to the course'));
