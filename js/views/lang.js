import { h, fill, add, md, clear, fmtMinutes, normRoman, toast } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { nt, rm, audioBtn, itemRow, exampleRow, writingPad, ctx } from '../components.js';
import { speak, canSpeak, stop } from '../audio.js';
import { runSession, Q, mixedQuestions } from '../session.js';
import { weekChart, crumbs } from './shared.js';

const PARTS = [
  ['words', 'Words'],
  ['phrases', 'Phrases'],
  ['grammar', 'Grammar'],
  ['dialogue', 'Dialogue'],
  ['check', 'Check'],
];

// ---------- language overview ----------
export async function langHome({ code, L }) {
  const [c, units] = await Promise.all([data.course(code), data.allUnits(code)]);
  const st = store.cardStats(code);
  const letters = data.scriptLetters(c);
  const seenLetters = store.hasLang(code) ? letters.filter((l) => store.lang(code).letters[l.char]).length : 0;
  const soundsSeen = store.hasLang(code) ? c.pronunciation.filter((p) => store.lang(code).sounds[p.id]).length : 0;
  const started = store.hasLang(code) && (st.total > 0 || seenLetters > 0);

  const next = suggestNext(code, c, units, { st, seenLetters, letters });
  const goal = store.settings().dailyGoal;
  const todayMin = Math.round(store.timeToday() / 60);
  const weekSec = store.timeByDay(7, code).reduce((s, d) => s + d.seconds, 0);

  return h(
    'div',
    { 'data-title': L.name },
    h(
      'div.lang-head',
      h('div', h('div.native', nt(c.native)), h('h1', { style: { margin: 0 } }, c.name)),
      h('p.muted', { style: { flex: '1 1 300px', margin: '0 0 6px' } }, c.tagline),
    ),
    h('p.small.muted', `${L.script} script · ${c.speakers} · ${c.where}`),
    started
      ? h(
          'div.stat-row',
          stat(st.words, 'words learned'),
          stat(st.mastered, 'known well'),
          stat(st.due, 'due for review'),
          stat(`${seenLetters}/${letters.length}`, 'letters practised'),
          stat(fmtMinutes(weekSec), 'this week'),
        )
      : null,
    h(
      'div.card.next-card',
      { style: { marginTop: started ? 0 : '18px' } },
      h('div', h('div.small.muted', started ? 'Suggested next step' : 'Start here'), h('h3', { style: { margin: '2px 0' } }, next.title), h('div.small.muted', next.why)),
      h('a.btn.accent', { href: next.href }, next.cta),
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
    h('details.about', { style: { marginTop: '22px' }, open: !started }, h('summary', `About ${c.name}`), md(c.intro), h('h3', 'Reading the romanization'), md(c.romanizationNote)),
    h(
      'section.section',
      h('div.section-head', h('h2', 'Foundations'), h('span.small.muted', 'Do these first, then keep coming back')),
      h(
        'div.grid.wide',
        h(
          'a.card',
          { href: `#/l/${code}/script` },
          h('div.row.between', h('h3', 'The script'), h('span.nt', { style: { fontSize: '1.5rem' } }, letters.slice(0, 3).map((l) => l.char).join(' '))),
          h('p.small.muted', `${letters.length} letters, signs and conjuncts with audio, stroke hints and a writing pad.`),
          h('div.bar.good', h('i', { style: { width: `${(seenLetters / letters.length) * 100}%` } })),
        ),
        h(
          'a.card',
          { href: `#/l/${code}/sounds` },
          h('h3', 'Pronunciation'),
          h('p.small.muted', `${c.pronunciation.length} lessons on the sounds that matter — minimal pairs, ear training and speaking.`),
          h('div.bar.good', h('i', { style: { width: `${(soundsSeen / c.pronunciation.length) * 100}%` } })),
        ),
        h('a.card', { href: `#/l/${code}/numbers` }, h('h3', 'Numbers'), h('p.small.muted', 'Every number from 0 to 100 (they are irregular!), plus hundreds, thousands, lakhs and crores.')),
      ),
    ),
    h(
      'section.section#units',
      h('div.section-head', h('h2', 'Course'), h('span.small.muted', '20 units · ' + units.reduce((s, u) => s + u.vocab.length, 0) + ' words · ' + units.reduce((s, u) => s + u.phrases.length, 0) + ' phrases')),
      h(
        'div.unit-list',
        units.map((u) => {
          const us = store.unitState(code, u.id);
          const n = PARTS.filter(([k]) => us[k]).length;
          return h(
            'a.unit-row' + (us.check ? '.done' : n ? '.started' : ''),
            { href: `#/l/${code}/u/${u.id}` },
            h('span.unit-num', us.check ? '✓' : u.id),
            h('div', h('div.t', u.title), h('div.g', u.goal)),
            h('div.parts', { title: PARTS.map(([k, l]) => `${l}: ${us[k] ? 'done' : '—'}`).join('\n') }, PARTS.map(([k]) => h('i' + (us[k] ? '.on' : '')))),
          );
        }),
      ),
    ),
    started ? h('section.section', h('div.card', h('div.row.between', h('strong', `${c.name} — last 14 days`), h('span.small.muted', `${fmtMinutes(store.totalTime(code))} in total`)), weekChart(store.timeByDay(14, code)))) : null,
  );
}

const stat = (b, s) => h('div.stat', h('b', b), h('span', s));

function encouragement(st, todayMin, goal) {
  if (todayMin >= goal) return 'That is your time for today. Anything more is a bonus.';
  if (todayMin > 0) return 'Every few minutes counts — short, regular sessions beat long rare ones.';
  if (st.due) return `A quick review of ${st.due} item${st.due === 1 ? '' : 's'} is a good way to start.`;
  return 'No pressure — pick up wherever you like.';
}

function milestone(words) {
  if (words >= 500) return 'You know the full core vocabulary of this course.';
  if (words >= 300) return 'Enough words to follow everyday conversations on familiar topics.';
  if (words >= 150) return 'Enough to handle shopping, directions, food and small talk.';
  if (words >= 50) return 'Enough for greetings, introductions and simple questions.';
  return '';
}

function suggestNext(code, c, units, { st, seenLetters, letters }) {
  if (!store.hasLang(code) || (st.total === 0 && seenLetters === 0)) {
    return { title: 'Meet the script', why: `Get to know ${ctx.lang.script} letter by letter — it makes everything after it easier. (You can also jump straight into Unit 1; romanization is always available.)`, href: `#/l/${code}/script`, cta: 'Start with the script' };
  }
  if (st.due >= 15) return { title: `Review ${st.due} items`, why: 'These are right on the edge of being forgotten — a short review locks them in.', href: `#/l/${code}/review`, cta: 'Review now' };
  const firstGroups = c.script.groups.slice(0, 3);
  const basicLetters = firstGroups.flatMap((g) => g.letters);
  const seenBasic = basicLetters.filter((l) => store.lang(code).letters[l.char]).length;
  if (seenBasic < basicLetters.length * 0.6 && st.words < 20) {
    return { title: 'Keep going with the script', why: `${seenLetters} of ${letters.length} letters practised. Try the letter drills or the handwriting pad.`, href: `#/l/${code}/practice/letters`, cta: 'Practise letters' };
  }
  for (const u of units) {
    const us = store.unitState(code, u.id);
    if (us.check) continue;
    const part = PARTS.find(([k]) => !us[k]);
    const m = milestone(st.words);
    return {
      title: `Unit ${u.id}: ${u.title} — ${part[1].toLowerCase()}`,
      why: (m ? m + ' ' : '') + u.goal,
      href: part[0] === 'words' || part[0] === 'phrases' ? `#/l/${code}/u/${u.id}/learn/${part[0]}` : `#/l/${code}/u/${u.id}?t=${part[0]}`,
      cta: part[0] === 'check' ? 'Take the check' : part[0] === 'words' || part[0] === 'phrases' ? 'Learn' : 'Open',
    };
  }
  if (st.due) return { title: `Review ${st.due} items`, why: 'You have finished every unit. Keep your vocabulary fresh.', href: `#/l/${code}/review`, cta: 'Review' };
  return { title: 'Read and listen', why: 'You have finished the course. Re-read the dialogues without romanization and shadow them aloud.', href: `#/l/${code}/reading`, cta: 'Open reading room' };
}

// ---------- unit ----------
export async function unitView({ code, L, params, query }) {
  const n = parseInt(params[1], 10);
  if (!(n >= 1 && n <= L.units)) return notFound(code, 'That unit does not exist.');
  const [c, u] = await Promise.all([data.course(code), data.unit(code, n)]);
  const tab = query.get('t') || 'words';
  const pane = h('div');
  const tabsEl = h('div.tabs');
  const us = () => store.unitState(code, n);

  function renderTabs(active) {
    fill(tabsEl, 
      PARTS.map(([k, label]) =>
        h(
          'button' + (k === active ? '.on' : ''),
          {
            onclick: () => {
              history.replaceState(null, '', `#/l/${code}/u/${n}?t=${k}`);
              show(k);
            },
          },
          label,
          us()[k] ? h('span.tick', '✓') : null,
        ),
      ),
    );
  }

  function show(k) {
    stop();
    renderTabs(k);
    clear(pane);
    const items = data.unitItems(code, u);
    if (k === 'words' || k === 'phrases') {
      const list = k === 'words' ? items.filter((i) => i.kind === 'word') : items.filter((i) => i.kind === 'phrase');
      const known = list.filter((i) => store.card(code, i.key)).length;
      add(pane, 
        k === 'words' ? md(u.intro) : null,
        h(
          'div.row.between',
          { style: { margin: '6px 0 14px' } },
          h('span.small.muted', `${list.length} ${k} · ${known} in your review deck`),
          h(
            'div.row',
            list.length - known > 0
              ? h('a.btn.primary', { href: `#/l/${code}/u/${n}/learn/${k}` }, known ? `Learn the next ${Math.min(store.settings().newPerSession, list.length - known)}` : `Learn these ${k}`)
              : h('a.btn', { href: `#/l/${code}/u/${n}/learn/${k}` }, 'Practise again'),
          ),
        ),
        h('div.items', list.map((it) => itemRow(it, { phrase: k === 'phrases' }))),
      );
    } else if (k === 'grammar') {
      store.markUnit(code, n, 'grammar');
      renderTabs(k);
      add(pane, 
        u.grammar.map((g) => h('div.grammar', h('h2', g.title), md(g.body), h('div.examples', g.examples.map(exampleRow)))),
        u.culture ? h('div.callout', h('strong', 'Culture & usage. '), md(u.culture)) : null,
      );
    } else if (k === 'dialogue') {
      store.markUnit(code, n, 'dialogue');
      renderTabs(k);
      add(pane, dialogueBlock(u.dialogue));
    } else if (k === 'check') {
      const pool = items;
      const start = () => {
        const words = items.filter((i) => i.kind === 'word');
        const phrases = items.filter((i) => i.kind === 'phrase');
        const qs = [
          ...mixedQuestions(words, pool, { n: 8, kinds: ['meaning', 'recall', 'listen', 'typeRoman'] }),
          ...mixedQuestions(phrases, pool, { n: 4, kinds: ['build', 'meaning', 'build', 'listen'] }),
        ];
        runSession(pane, {
          code,
          questions: qs,
          onExit: () => show('check'),
          retry: (missed) => runSession(pane, { code, questions: mixedQuestions(missed, pool, { n: missed.length }), onExit: () => show('check') }),
          onDone: ({ pct }) => {
            if (pct >= 70) {
              store.markUnit(code, n, 'check');
              renderTabs('check');
            }
          },
          doneLabel: 'Back to unit',
        });
      };
      add(pane, 
        h(
          'div.card',
          { style: { maxWidth: '560px' } },
          h('h2', 'Unit check'),
          h('p.muted', `12 mixed questions on this unit's words and phrases. Score 70% or more to mark Unit ${n} complete — and whatever you miss goes into your review queue.`),
          us().check ? h('p.small', { style: { color: 'var(--good)' } }, '✓ You have completed this unit. You can retake the check any time.') : null,
          h('button.btn.primary', { onclick: start }, 'Start the check'),
        ),
      );
    }
  }
  show(tab);

  return h(
    'div',
    { 'data-title': `Unit ${n}: ${u.title}` },
    crumbs([L.name, `#/l/${code}`], ['Course', `#/l/${code}?to=units`], [`Unit ${n}`]),
    h('h1', u.title),
    h('p.muted', u.goal),
    tabsEl,
    pane,
    h('hr'),
    h(
      'div.row.between',
      n > 1 ? h('a.btn.ghost', { href: `#/l/${code}/u/${n - 1}` }, '← Unit ' + (n - 1)) : h('span'),
      n < 20 ? h('a.btn.ghost', { href: `#/l/${code}/u/${n + 1}` }, 'Unit ' + (n + 1) + ' →') : h('span'),
    ),
  );
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
  let idx = 0;
  return h(
    'div',
    { 'data-title': `${L.script} script` },
    crumbs([L.name, `#/l/${code}`], ['Script']),
    h('h1', `The ${L.script} script`),
    h(
      'div.row',
      { style: { marginBottom: '14px' } },
      h('a.btn.primary', { href: `#/l/${code}/practice/letters` }, 'Letter drill'),
      h('a.btn', { href: `#/l/${code}/practice/writing` }, 'Handwriting practice'),
      h('a.btn', { href: `#/l/${code}/practice/reading-words` }, 'Read real words'),
      h('button.btn.ghost', { onclick: () => window.print() }, 'Print chart'),
    ),
    h('details.about', { open: !Object.keys(seen).length }, h('summary', 'How the script works'), md(c.script.overview)),
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
      crumbs([L.name, `#/l/${code}`], ['Reading', `#/l/${code}/reading`], [u.dialogue.title]),
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
    crumbs([L.name, `#/l/${code}`], ['Reading']),
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
  const [c, units] = await Promise.all([data.course(code), data.allUnits(code)]);
  return h(
    'div',
    { 'data-title': 'Reference' },
    crumbs([L.name, `#/l/${code}`], ['Reference']),
    h('h1', 'Reference'),
    h(
      'div.grid',
      h('a.card', { href: `#/l/${code}/glossary` }, h('h3', 'Glossary'), h('p.small.muted', 'Search every word and phrase in the course, in English, romanization or script.')),
      h('a.card', { href: `#/l/${code}/numbers` }, h('h3', 'Numbers'), h('p.small.muted', '0–100 and the big ones, with audio.')),
      h('a.card', { href: `#/l/${code}/script` }, h('h3', 'Alphabet chart'), h('p.small.muted', 'The whole script on one page — printable.')),
      h('a.card', { href: `#/l/${code}/reading` }, h('h3', 'Reading room'), h('p.small.muted', 'All 20 dialogues.')),
    ),
    h(
      'section.section',
      h('h2', 'Grammar index'),
      h(
        'div.table-wrap',
        h(
          'table',
          units.flatMap((u) => u.grammar.map((g) => h('tr', h('td.small.muted', `Unit ${u.id}`), h('td', h('a', { href: `#/l/${code}/u/${u.id}?t=grammar` }, g.title))))),
        ),
      ),
    ),
    h('section.section', h('h2', 'Romanization in this course'), md(c.romanizationNote)),
  );
}

export async function numbersView({ code, L }) {
  const c = await data.course(code);
  return h(
    'div',
    { 'data-title': 'Numbers' },
    crumbs([L.name, `#/l/${code}`], ['Numbers']),
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
