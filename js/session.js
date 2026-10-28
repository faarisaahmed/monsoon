// The practice-session engine: renders one question at a time and reports results.

import { h, fill, add, clear, md, shuffle, sample, normRoman, englishMatches, similarity, toast } from './ui.js';
import { ctx, nt, rm, audioBtn, play, ICONS, writingPad, exampleRow } from './components.js';
import { canSpeak, canRecognize, recognize, canRecord, record as recordAudio, stop, pauseFor, listeningOn, speakingOn } from './audio.js';
import * as store from './store.js';
import { cloze, tokens, wordRomans, romanWords } from './sentences.js';
import { joinForms, POSITIONS } from './letters.js';

// ---------- question builders ----------
const distinctBy = (arr, f) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = f(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
// Wrong options should be plausible: same kind and part of speech, same topic, similar shape,
// and ideally things you have already met — otherwise the answer is just "the familiar one".
const words = (t) => (t || '').trim().split(/\s+/).length;
const isQuestion = (t) => /[?؟]\s*$/.test(t || '');
const fold = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Glosses often list several meanings ("yes; that's right" / "okay; right, correct"): if any
// meaning of one option matches a meaning of the answer, both would be right, so it can't be used.
const senses = (t) =>
  fold(t)
    .replace(/\(.*?\)/g, ' ')
    .split(/[;,/]| or /)
    .map((x) => x.replace(/^\s*(to|a|an|the)\s+/, '').replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
// Short glosses sharing a key word are near-synonyms too ("thank you" / "thanks").
const STOP = new Set('the you your my our his her their its a an is are am was be been to of and or it this that that\'s these those i me we he she they with for in on at not no do does very'.split(' '));
const stems = (x) => x.split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5));
function overlaps(a, b) {
  const A = senses(a), B = senses(b);
  return A.some((x) =>
    B.some((y) => {
      if (x === y || (x.length > 2 && y.length > 2 && (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `)))) return true;
      if (x.split(' ').length > 3 || y.split(' ').length > 3) return false;
      const sy = stems(y);
      return stems(x).some((w) => sy.includes(w));
    }),
  );
}
function distractors(item, pool, n, field) {
  const code = ctx.lang?.code;
  const learnable = item.kind === 'word' || item.kind === 'phrase' || item.kind === 'sentence';
  const cands = distinctBy(
    pool.filter((p) => p[field] !== item[field] && p.native !== item.native && p.en !== item.en && !(learnable && overlaps(p.en, item.en))),
    (p) => p[field],
  );
  const target = item[field] || '';
  const score = (p) => {
    const v = p[field] || '';
    let s = Math.abs(v.length - target.length) / Math.max(4, target.length) * 3;
    if (p.kind !== item.kind) s += 10;
    if (item.pos && p.pos !== item.pos) s += 4;
    if (item.kind === 'phrase' || item.kind === 'sentence') s += Math.min(3, Math.abs(words(p.en) - words(item.en))) + (isQuestion(p.en) !== isQuestion(item.en) ? 3 : 0);
    if (item.unit && p.unit) s += p.unit === item.unit ? -2 : Math.min(2, Math.abs(p.unit - item.unit) / 4);
    if (learnable && code && p.key && !store.card(code, p.key)) s += 1.5;
    if (fold(v)[0] && fold(v)[0] === fold(target)[0]) s -= 1;
    return s + Math.random() * 1.5;
  };
  return cands.map((p) => [score(p), p]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
}
function mc(item, pool, from, to, extra = {}) {
  const opts = shuffle([item, ...distractors(item, pool, 3, to === 'native' ? 'native' : 'en')]);
  return { type: 'mc', item, from, to, options: opts, answer: opts.indexOf(item), ...extra };
}
export const Q = {
  meaning: (item, pool) => mc(item, pool, 'native', 'en'),
  recall: (item, pool) => mc(item, pool, 'en', 'native'),
  listen: (item, pool) => mc(item, pool, 'audio', 'en'),
  typeRoman: (item) => ({ type: 'type', item, mode: 'en2roman' }),
  dictation: (item) => ({ type: 'type', item, mode: 'audio2roman' }),
  typeNative: (item, keys) => ({ type: 'type', item, mode: 'en2native', keys }),
  build: (item, pool) => {
    const toks = item.native.replace(/[?.!,।۔؟،]/g, ' $& ').split(/\s+/).filter(Boolean);
    // romanization for each tile, so the sentence can be built without reading the script
    const romans = new Map();
    const own = wordRomans(item);
    if (own) toks.filter((t) => tokens(t).length).forEach((t, j) => romans.set(t, own[j]));
    const others = shuffle(pool.filter((p) => p !== item && p.native.includes(' ')));
    const extra = [];
    const extraRoman = [];
    const want = Math.min(3, Math.max(1, 7 - toks.length));
    for (const p of others) {
      if (extra.length >= want) break;
      const r = wordRomans(p);
      tokens(p.native).forEach((t, j) => {
        if (extra.length >= want || toks.includes(t) || extra.includes(t)) return;
        extra.push(t);
        if (r) romans.set(t, r[j]), extraRoman.push(r[j]);
      });
    }
    const romanAnswer = romanWords(item.roman);
    return {
      type: 'build',
      item,
      tokens: shuffle([...toks, ...extra]),
      answer: toks,
      romans: own ? romans : null,
      // when the words don't line up, the tiles can be in romanization instead
      romanTokens: shuffle([...romanAnswer, ...extraRoman.filter((r) => !romanAnswer.includes(r))]),
      romanAnswer,
    };
  },
  // hear a sentence, then put its words in order (no English shown)
  listenBuild: (item, pool) => ({ ...Q.build(item, pool), listen: true }),
  cloze: (item, lex) => cloze(item, { forms: item.forms, lex }),
  speak: (item) => ({ type: 'speak', item }),
  flash: (item, front) => ({ type: 'flash', item, front }),
  intro: (item) => ({ type: 'intro', item }),
  // a lesson's rule, shown before you use it: { title, body, pattern }, two examples, the full notes
  tip: (tip, examples, notes) => ({ type: 'tip', tip, examples, notes }),
  pair: (pair) => {
    const which = Math.random() < 0.5 ? 'a' : 'b';
    return { type: 'pair', pair, which, item: pair[which] };
  },
  letterName: (l, letters) => {
    const opts = shuffle([l, ...distractors({ ...l, en: l.roman, native: l.char }, letters.map((x) => ({ ...x, en: x.roman, native: x.char })), 3, 'en').map((d) => letters.find((x) => x.char === d.char))]);
    return { type: 'letter', item: l, dir: 'char2roman', options: opts, answer: opts.indexOf(l) };
  },
  letterIntro: (l) => ({ type: 'letterIntro', item: l }),
  // a letter as it looks joined at the start, middle or end of a word: which letter is it?
  letterForm: (l, letters, pos, forms) => {
    const opts = shuffle([l, ...distractors({ ...l, en: l.roman, native: l.char }, letters.map((x) => ({ ...x, en: x.roman, native: x.char })), 3, 'native').map((d) => letters.find((x) => x.char === d.char))]);
    return { type: 'letter', item: l, dir: 'form2char', pos, shape: forms[pos], options: opts, answer: opts.indexOf(l) };
  },
  letterFind: (l, letters) => {
    const opts = shuffle([l, ...distractors({ ...l, en: l.roman, native: l.char }, letters.map((x) => ({ ...x, en: x.roman, native: x.char })), 3, 'native').map((d) => letters.find((x) => x.char === d.char))]);
    return { type: 'letter', item: l, dir: 'roman2char', options: opts, answer: opts.indexOf(l) };
  },
  write: (l) => ({ type: 'write', item: l }),
  number: (n) => ({ type: 'number', item: n }),
};

// ---------- runner ----------
// opts: { title, questions, onExit, onDone(results), code, record:true (update SRS) }
export function runSession(root, opts) {
  const L = ctx.lang;
  let audioBroken = false;
  // Without sound (no voice, switched off, or it failed to load), listening questions become
  // their written version and the ones with no written version are dropped.
  const adapt = (q) => {
    if (needsAudio(q) && (audioBroken || !listeningOn(L.tts))) return writtenVersion(q);
    if (q.type === 'speak' && !speakingOn()) return null;
    return q;
  };
  let qs = opts.questions.map(adapt).filter(Boolean);
  const readapt = () => {
    qs = [...qs.slice(0, i), ...qs.slice(i).map(adapt).filter(Boolean)];
    if (i >= qs.length) finish();
    else show();
  };
  const audioFailed = () => {
    if (audioBroken || body.querySelector('.feedback')) return;
    audioBroken = true;
    toast('The audio could not play, so listening questions are switched to written ones for this session.');
    readapt();
  };
  const results = [];
  let i = 0;
  let keyHandler = null;

  const top = h('div.session-top');
  const body = h('div');
  const el = h('div.session', top, body);
  clear(root).appendChild(el);

  function setKeys(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  }
  const cleanupObserver = new MutationObserver(() => {
    if (!el.isConnected) {
      setKeys(null);
      stop();
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });

  function header() {
    fill(top, 
      h('button.icon-btn.sm', { title: 'Leave session', 'aria-label': 'Leave session', html: ICONS.x, onclick: () => (setKeys(null), opts.onExit?.()) }),
      h('div.bar', h('i', { style: { width: `${(i / qs.length) * 100}%` } })),
      h('span.small.muted', `${Math.min(i + 1, qs.length)} / ${qs.length}`),
      romanToggle(),
    );
  }

  // Romanization on or off without leaving the session; the question redraws if it isn't answered yet.
  function romanToggle() {
    const on = store.settings().roman === 'show';
    return h(
      'button.roman-toggle' + (on ? '.on' : ''),
      {
        type: 'button',
        title: on ? 'Romanization is shown — tap to hide it' : 'Show romanization (Latin letters) everywhere',
        'aria-pressed': String(on),
        onclick: () => {
          store.setSetting('roman', on ? 'hide' : 'show');
          if (i < qs.length && !body.querySelector('.feedback')) show();
          else header();
        },
      },
      'abc',
    );
  }

  function record(q, correct, grade) {
    results.push({ q, correct });
    // missed it? it comes back a few questions later (twice at most), with the choices reshuffled
    if (!correct && opts.requeue && (q.again || 0) < 2 && q.options) {
      const options = shuffle(q.options);
      qs.splice(Math.min(qs.length, i + 3), 0, { ...q, again: (q.again || 0) + 1, options, answer: options.indexOf(q.options[q.answer]) });
    }
    if (opts.record === false || !q.item?.key) return;
    const key = q.item.key;
    const c = store.card(opts.code, key);
    // in a review, a question that isn't a self-graded card grades itself
    if (grade == null && opts.type === 'review' && c) grade = correct ? 2 : 0;
    if (grade != null) {
      store.ensureCard(opts.code, key, cardMeta(q.item));
      store.review(opts.code, key, grade);
    } else if (opts.learn) {
      delete store.ensureCard(opts.code, key, cardMeta(q.item)).unseen;
    } else if (!correct) {
      // a miss goes (back) to the front of the review queue
      const missed = store.ensureCard(opts.code, key, { ...cardMeta(q.item), unseen: !c });
      missed.due = Math.min(missed.due, Date.now());
    } else if (c && correct && c.due <= Date.now()) {
      store.review(opts.code, key, 2);
    }
  }

  function next() {
    stop();
    i++;
    if (i >= qs.length) return finish();
    show();
  }

  function feedback(ok, q, extraMsg) {
    const it = q.item;
    const cont = h('button.btn.primary', { onclick: next }, 'Continue');
    const fb = h(
      'div.feedback.' + (ok ? 'good' : 'bad'),
      h(
        'div',
        h('div', h('strong', ok ? 'Correct' : 'Not quite'), extraMsg ? h('span.muted', ' — ', extraMsg) : null),
        it && it.native ? h('div', nt(it.native), ' ', rm(it.roman, 'show'), h('span.muted', ' · ', it.en)) : null,
        it?.kind === 'sentence' && it.note ? h('div.small.muted', it.note) : null,
      ),
      h('div.row', it?.native ? audioBtn(it.native) : null, cont),
    );
    body.querySelector('.quiet')?.remove();
    body.appendChild(fb);
    setTimeout(() => cont.focus(), 30);
    setKeys((e) => {
      if (e.key === 'Enter' && document.activeElement !== cont) {
        e.preventDefault();
        next();
      }
    });
    if (it?.native && !ok) setTimeout(() => play(it.native), 200);
  }

  function promptBlock(q) {
    const it = q.item;
    const long = (it.native || '').length > 14;
    if (q.reading) return h('div.prompt', h('div.q', 'How is this word read?'), nt(it.native, long ? 'long' : ''));
    if (q.from === 'native') return h('div.prompt', h('div.q', 'What does this mean?'), h('div.row', nt(it.native, long ? 'long' : ''), audioBtn(it.native)), rm(it.roman));
    if (q.from === 'en') return h('div.prompt', h('div.q', 'How do you say…'), h('div.en-big', it.en));
    if (q.from === 'audio') return h('div.prompt', h('div.q', 'Listen. What does it mean?'), h('div.row', audioBtn(it.native, { size: 'lg', auto: true, onFail: audioFailed }), audioBtn(it.native, { slow: true })));
    return h('div.prompt');
  }

  function renderMC(q) {
    const buttons = q.options.map((o, idx) => {
      const label = q.to === 'native' ? h('span', nt(o.native), ' ', o.roman && store.settings().roman === 'show' ? h('span.roman.small', o.roman) : null) : h('span', o.en);
      return h('button.opt', { onclick: () => choose(idx) }, h('span.k', idx + 1), label);
    });
    const choose = (idx) => {
      if (buttons[0].disabled) return;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === idx) b.classList.add('picked');
        if (j === q.answer) b.classList.add('right');
        else if (j === idx) b.classList.add('wrong');
      });
      const ok = idx === q.answer;
      record(q, ok);
      if (q.to === 'native' || q.from === 'en') play(q.item.native);
      feedback(ok, q);
    };
    add(body, promptBlock(q), h('div.options' + (q.to === 'native' ? '' : ''), buttons));
    setKeys((e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= buttons.length) choose(n - 1);
    });
  }

  function renderLetter(q) {
    const l = q.item;
    const buttons = q.options.map((o, idx) =>
      h('button.opt', { onclick: () => choose(idx) }, h('span.k', idx + 1), q.dir === 'char2roman' ? h('span', o.roman || '—') : nt(o.char), q.dir === 'form2char' && o.roman ? h('span.roman.small', ' ' + o.roman) : null),
    );
    const choose = (idx) => {
      if (buttons[0].disabled) return;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === idx) b.classList.add('picked');
        if (j === q.answer) b.classList.add('right');
        else if (j === idx) b.classList.add('wrong');
      });
      const ok = idx === q.answer;
      record(q, ok);
      if (ok) store.markLetter(opts.code, l.char);
      feedback(ok, { item: l.example ? { ...l.example } : null }, `${l.char} = ${l.roman}${l.ipa ? ' /' + l.ipa + '/' : ''}`);
    };
    const where = q.pos && POSITIONS.find(([p]) => p === q.pos)[1];
    add(body, 
      q.dir === 'char2roman'
        ? h('div.prompt', h('div.q', 'Which sound is this?'), nt(l.char, 'big-glyph'))
        : q.dir === 'form2char'
          ? h('div.prompt', h('div.q', `This is a letter ${where}. Which one?`), nt(q.shape, 'big-glyph'))
          : h('div.prompt', h('div.q', 'Find the letter for'), h('div.en-big', l.roman || '—'), h('div.muted', l.sound)),
      h('div.options' + (q.dir !== 'char2roman' ? '.two' : ''), buttons),
    );
    setKeys((e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= buttons.length) choose(n - 1);
    });
  }

  function renderType(q) {
    const it = q.item;
    let prompt;
    if (q.mode === 'en2roman') prompt = h('div.prompt', h('div.q', 'Translate — type it in romanization'), h('div.en-big', it.en));
    else if (q.mode === 'audio2roman') prompt = h('div.prompt', h('div.q', 'Dictation — type what you hear (romanization)'), h('div.row', audioBtn(it.native, { size: 'lg', auto: true, onFail: audioFailed }), audioBtn(it.native, { slow: true })));
    else prompt = h('div.prompt', h('div.q', `Translate — type it in ${L.script}`), h('div.en-big', it.en));
    const input = h('input.answer-input' + (q.mode === 'en2native' ? '.nt' : ''), {
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      dir: q.mode === 'en2native' && L.dir === 'rtl' ? 'rtl' : 'auto',
      lang: q.mode === 'en2native' ? L.code : 'en',
      placeholder: q.mode === 'en2native' ? 'Type here' : 'Type here…  (accents optional)',
    });
    const submit = h('button.btn.primary.block', { style: { marginTop: '12px' } }, 'Check');
    const skip = h('button.btn.ghost.small', { style: { marginTop: '8px' } }, "I don't know");
    const check = (giveUp) => {
      if (input.disabled) return;
      const v = input.value;
      if (!v.trim() && !giveUp) return input.focus();
      let ok = false;
      let close = false;
      if (q.mode === 'en2native') {
        const a = v.replace(/[\s?.!,।۔؟،]/g, ''),
          b = it.native.replace(/[\s?.!,।۔؟،]/g, '');
        ok = a === b;
        close = !ok && similarity(a, b) >= 0.8;
      } else {
        const a = normRoman(v),
          b = normRoman(it.roman);
        ok = a === b || a.replace(/ /g, '') === b.replace(/ /g, '');
        close = !ok && similarity(a.replace(/ /g, ''), b.replace(/ /g, '')) >= 0.8;
      }
      if (giveUp) ok = close = false;
      input.disabled = submit.disabled = true;
      skip.remove();
      record(q, ok || close);
      if (q.mode !== 'audio2roman') play(it.native);
      feedback(ok || close, q, close ? 'almost — check the spelling' : null);
    };
    submit.onclick = () => check(false);
    skip.onclick = () => check(true);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        check(false);
      }
    });
    add(body, prompt, input, q.mode === 'en2native' ? keyboard(input, q.keys) : null, submit, h('div.center', skip));
    setKeys(null);
    setTimeout(() => input.focus(), 50);
  }

  function renderBuild(q) {
    const it = q.item;
    const line = h('div.chips.answer-line');
    const bank = h('div.chips');
    const showRoman = store.settings().roman === 'show';
    // can't pair each word with its romanization? then build it in romanization
    const inRoman = showRoman && !q.romans && q.romanAnswer?.length > 1;
    const tiles = inRoman ? q.romanTokens : q.tokens;
    const answer = inRoman ? q.romanAnswer : q.answer;
    const face = (t) => (inRoman ? h('span.chip-r', t) : [nt(t), showRoman && q.romans?.get(t) ? h('span.chip-roman', q.romans.get(t)) : null]);
    const chosen = [];
    const chips = tiles.map((t) => {
      const c = h('button.chip', { type: 'button', 'data-t': t }, face(t));
      c.onclick = () => {
        if (done) return;
        if (c.parentNode === bank) {
          const placeholder = h('span.chip.used', face(t));
          c._ph = placeholder;
          bank.replaceChild(placeholder, c);
          line.appendChild(c);
          chosen.push(t);
        } else {
          line.removeChild(c);
          bank.replaceChild(c, c._ph);
          chosen.splice(chosen.indexOf(t), 1);
        }
      };
      return c;
    });
    add(bank, ...chips);
    let done = false;
    const submit = h('button.btn.primary.block', { style: { marginTop: '16px' } }, 'Check');
    submit.onclick = () => {
      if (done) return;
      const got = [...line.children].map((c) => c.dataset.t);
      if (!got.length) return;
      done = true;
      submit.disabled = true;
      const ok = got.join(' ') === answer.join(' ');
      record(q, ok);
      if (!q.listen) play(it.native);
      feedback(ok, q, !ok && it.topic && it.grammar != null ? `see “${it.topic}”` : null);
    };
    if (L.dir === 'rtl' && !inRoman) line.dir = bank.dir = 'rtl';
    const prompt = q.listen
      ? h('div.prompt', h('div.q', 'Listen, then build what you heard'), h('div.row', audioBtn(it.native, { size: 'lg', auto: true, onFail: audioFailed }), audioBtn(it.native, { slow: true })))
      : h('div.prompt', h('div.q', 'Build the sentence'), h('div.en-big', it.en));
    add(body, prompt, line, bank, submit);
    setKeys(null);
  }

  function renderCloze(q) {
    const it = q.item;
    const romanMode = store.settings().roman;
    const gap = h('span.gap', '\u00a0');
    const sentence = h('div.cloze', { dir: L.dir === 'rtl' ? 'rtl' : null }, q.before ? nt(q.before) : null, gap, q.after ? nt(q.after) : null);
    const romanGap = h('span.gap.small', '\u00a0');
    const roman = q.romanBefore != null && romanMode !== 'hide' ? h('div.roman.cloze-roman', q.romanBefore, ' ', romanGap, ' ', q.romanAfter) : null;
    const buttons = q.options.map((o, idx) =>
      h('button.opt', { onclick: () => choose(idx) }, h('span.k', idx + 1), h('span', nt(o.native), o.roman && romanMode === 'show' ? h('span.roman.small', ' ' + o.roman) : null)),
    );
    const choose = (idx) => {
      if (buttons[0].disabled) return;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === idx) b.classList.add('picked');
        if (j === q.answer) b.classList.add('right');
        else if (j === idx) b.classList.add('wrong');
      });
      const ok = idx === q.answer;
      fill(gap, nt(q.options[q.answer].native));
      gap.classList.add(ok ? 'good' : 'bad');
      if (q.options[q.answer].roman) romanGap.textContent = q.options[q.answer].roman;
      record(q, ok);
      play(it.native);
      feedback(ok, q, !ok && it.topic && it.grammar != null ? `see “${it.topic}”` : null);
    };
    add(body, h('div.prompt', h('div.q', 'Fill the gap with the right word'), h('div.en-big', it.en), sentence, roman), h('div.options', buttons));
    setKeys((e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= buttons.length) choose(n - 1);
    });
  }

  function renderSpeak(q) {
    const it = q.item;
    const status = h('div.center.muted.small', canRecognize() ? 'Press the mic and say it.' : 'Record yourself, then compare with the model.');
    const meter = h('div.meter', h('i'));
    const mic = h('button.icon-btn.lg', { title: 'Speak', 'aria-label': 'Speak', html: ICONS.mic });
    const playback = h('div.row', { style: { justifyContent: 'center' } });
    let attempts = 0;
    const cont = h('button.btn.ghost.small', { onclick: () => (record(q, false), next()) }, "I can't say it yet");
    mic.onclick = async () => {
      if (mic.classList.contains('rec')) return;
      mic.classList.add('rec');
      attempts++;
      try {
        if (canRecognize(L.tts)) {
          status.textContent = 'Listening…';
          const alts = await recognize(L.tts);
          mic.classList.remove('rec');
          const target = it.native.replace(/[\s?.!,।۔؟،]/g, '');
          const best = alts.map((a) => ({ a, s: similarity(a.replace(/[\s?.!,।۔؟،]/g, ''), target) })).sort((x, y) => y.s - x.s)[0];
          if (!best) {
            status.textContent = 'Nothing recognised — try again.';
            return;
          }
          const pct = Math.round(best.s * 100);
          const verdict = pct >= 90 ? 'Excellent — that was recognised exactly.' : pct >= 70 ? 'Close. Listen to the model and try once more.' : 'Not recognised as the target. Listen again, slow down, and retry.';
          fill(status, h('div', h('strong', `${pct}% match. `), verdict), h('div', 'Heard: ', nt(best.a)));
          if (pct >= 70) {
            record(q, true);
            setTimeout(() => {
              if (!body.querySelector('.feedback')) feedback(true, q, `${pct}% match`);
            }, 400);
          }
        } else {
          status.textContent = 'Recording… (up to 5 s)';
          const lv = meter.firstChild;
          const r = await recordAudio(5000, (v) => (lv.style.width = Math.min(100, v * 160) + '%'));
          const stopBtn = h('button.btn.small', { onclick: () => r.stop() }, 'Stop');
          status.after(stopBtn);
          const blob = await r.done;
          stopBtn.remove();
          mic.classList.remove('rec');
          lv.style.width = '0';
          const url = URL.createObjectURL(blob);
          fill(playback, h('button.btn.small', { onclick: () => new Audio(url).play() }, h('span', { html: ICONS.play, style: { width: '14px', display: 'inline-flex' } }), 'Your voice'), audioBtn(it.native));
          status.textContent = 'Compare your recording with the model. How was it?';
          const g = h(
            'div.row',
            { style: { justifyContent: 'center', marginTop: '10px' } },
            h('button.btn.small', { onclick: () => (record(q, false), next()) }, 'Needs work'),
            h('button.btn.small.primary', { onclick: () => (record(q, true), next()) }, 'Sounded right'),
          );
          playback.after(g);
        }
      } catch (e) {
        mic.classList.remove('rec');
        status.textContent = e.message;
      }
    };
    add(body, 
      h('div.prompt', h('div.q', 'Say this out loud'), h('div.row', nt(it.native, it.native.length > 14 ? 'long' : ''), audioBtn(it.native), audioBtn(it.native, { slow: true })), rm(it.roman, 'show'), h('div.muted', it.en)),
      h('div.row', { style: { justifyContent: 'center' } }, mic, canRecognize() ? null : meter),
      status,
      playback,
      h('div.center', { style: { marginTop: '12px' } }, cont),
    );
    setKeys(null);
  }

  function renderFlash(q) {
    const it = q.item;
    const front = q.front === 'en' ? h('div.en-big', it.en) : h('div', h('div.row', { style: { justifyContent: 'center' } }, nt(it.native || it.char)), it.kind === 'letter' ? null : null);
    const back = h(
      'div.hidden',
      { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' } },
      q.front === 'en' ? h('div', nt(it.native)) : null,
      rm(it.roman, 'show'),
      q.front === 'en' ? null : h('div.en-big', it.en),
      it.note ? h('div.small.faint', it.note) : null,
      h('div', it.native ? audioBtn(it.native) : null),
    );
    const card = h('div.flash', h('div.q.muted.small', q.front === 'en' ? 'Say it in ' + L.name : 'What does it mean?'), front, back);
    const reveal = h('button.btn.primary.block', { style: { marginTop: '16px' } }, 'Show answer ', h('kbd', 'space'));
    const c = store.card(opts.code, it.key);
    const ivlLabel = (g) => {
      const tmp = { ...(c || { ease: 2.5, ivl: 0, reps: 0 }) };
      if (g === 0) return '10 min';
      const reps = tmp.reps + 1;
      let ivl = reps === 1 ? (g === 3 ? 3 : 1) : reps === 2 ? (g === 1 ? 2 : g === 3 ? 7 : 4) : Math.round(tmp.ivl * (g === 1 ? 1.2 : g === 3 ? tmp.ease * 1.3 : tmp.ease));
      ivl = Math.min(ivl, 365);
      return ivl >= 30 ? `${Math.round(ivl / 30)} mo` : `${ivl} d`;
    };
    const grades = h(
      'div.grades.hidden',
      [
        ['Again', 0],
        ['Hard', 1],
        ['Good', 2],
        ['Easy', 3],
      ].map(([label, g]) =>
        h('button.btn' + (g === 2 ? '.primary' : ''), { onclick: () => grade(g) }, label, h('small', `${g + 1} · ${ivlLabel(g)}`)),
      ),
    );
    const show = () => {
      back.classList.remove('hidden');
      reveal.classList.add('hidden');
      grades.classList.remove('hidden');
      if (it.native) play(it.native);
    };
    const grade = (g) => {
      record(q, g > 0, g);
      next();
    };
    reveal.onclick = show;
    if (q.front !== 'en' && it.native) setTimeout(() => play(it.native), 200);
    add(body, card, reveal, grades);
    setKeys((e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!reveal.classList.contains('hidden')) show();
        else if (e.key === 'Enter') grade(2);
      }
      const n = parseInt(e.key, 10);
      if (!grades.classList.contains('hidden') && n >= 1 && n <= 4) grade(n - 1);
    });
  }

  function renderIntro(q) {
    const it = q.item;
    const card = h(
      'div.flash',
      h('div.q.muted.small', it.kind === 'phrase' ? 'New phrase' : 'New word'),
      h('div', nt(it.native, it.native.length > 14 ? 'long' : '')),
      rm(it.roman, 'show'),
      h('div.en-big', it.en),
      it.note ? h('div.small.faint', it.note) : null,
      h('div.row', audioBtn(it.native, { auto: true }), audioBtn(it.native, { slow: true })),
    );
    const go = h('button.btn.primary.block', { style: { marginTop: '16px' }, onclick: () => (record(q, true), next()) }, 'Got it ', h('kbd', 'enter'));
    add(body, card, go);
    setTimeout(() => go.focus(), 30);
    setKeys((e) => {
      if (e.key === 'Enter' && document.activeElement !== go) {
        e.preventDefault();
        go.click();
      }
    });
  }

  function renderTip(q) {
    const t = q.tip;
    const card = h(
      'div.tip-card',
      h('div.tip-label', q.notes ? 'New rule' : 'Tip'),
      h('h2', t.title),
      md(t.body),
      t.pattern ? h('div.tip-pattern', { dir: 'auto' }, t.pattern) : null,
      q.examples.length
        ? h(
            'div.examples',
            q.examples.map((s) => h('div.ex', audioBtn(s.native, { size: 'sm' }), h('div', h('div', marked(s), ' ', rm(s.roman)), h('div.small', s.en)))),
          )
        : null,
      q.notes ? h('details.tip-notes', h('summary', 'Full notes on this'), md(q.notes.body), h('div.examples', q.notes.examples.map(exampleRow))) : null,
    );
    const go = h('button.btn.primary.block', { style: { marginTop: '16px' }, onclick: () => (record(q, true), next()) }, 'Got it ', h('kbd', 'enter'));
    add(body, card, go);
    setTimeout(() => go.focus({ preventScroll: true }), 30);
    setKeys((e) => {
      if (e.key === 'Enter' && document.activeElement !== go && document.activeElement?.tagName !== 'SUMMARY') {
        e.preventDefault();
        go.click();
      }
    });
  }

  function renderLetterIntro(q) {
    const l = q.item;
    const speakable = l.char.replace(/◌/g, '');
    const forms = joinForms(l, L.dir);
    const card = h(
      'div.flash.letter-intro',
      h('div.q.muted.small', 'New letter'),
      h('div.row', { style: { justifyContent: 'center', gap: '18px' } }, nt(l.char, 'big-glyph'), h('div', { style: { textAlign: 'left' } }, h('div.en-big', l.roman || '—'), l.ipa ? h('div.small.faint', `/${l.ipa}/`) : null)),
      h('div.muted', l.sound),
      l.sign && l.sign !== '—' ? h('div.small', 'After a consonant it is written as the sign ', nt(l.sign), l.signExample ? h('span.muted', ' — e.g. ', l.signExample) : null) : null,
      forms ? formsRow(forms) : null,
      l.example ? h('div.small', { style: { marginTop: '6px' } }, 'As in ', nt(l.example.native), ' ', h('span.roman', l.example.roman), h('span.muted', ' · ', l.example.en)) : null,
      h('div.row', { style: { justifyContent: 'center' } }, speakable ? audioBtn(speakable, { auto: true }) : null, l.example ? audioBtn(l.example.native, { size: 'sm' }) : null),
    );
    store.markLetter(opts.code, l.char);
    const go = h('button.btn.primary.block', { style: { marginTop: '16px' }, onclick: () => (record(q, true), next()) }, 'Got it ', h('kbd', 'enter'));
    add(body, card, go);
    setTimeout(() => go.focus(), 30);
    setKeys((e) => {
      if (e.key === 'Enter' && document.activeElement !== go) {
        e.preventDefault();
        go.click();
      }
    });
  }

  function renderPair(q) {
    const { pair } = q;
    const target = pair[q.which];
    const opts2 = [pair.a, pair.b];
    const buttons = opts2.map((o, idx) => h('button.opt', { onclick: () => choose(idx) }, h('span.k', idx + 1), h('span', nt(o.native), ' ', h('span.roman.small', o.roman), h('span.muted.small', ' · ' + o.en))));
    const choose = (idx) => {
      if (buttons[0].disabled) return;
      const ok = opts2[idx] === target;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === idx) b.classList.add('picked');
        if (opts2[j] === target) b.classList.add('right');
        else if (j === idx) b.classList.add('wrong');
      });
      results.push({ q, correct: ok });
      feedback(ok, { item: target }, pair.note || null);
    };
    add(body, h('div.prompt', h('div.q', 'Which word do you hear?'), h('div.row', audioBtn(target.native, { size: 'lg', auto: true, onFail: audioFailed }), audioBtn(target.native, { slow: true }))), h('div.options', buttons));
    setKeys((e) => {
      const n = parseInt(e.key, 10);
      if (n === 1 || n === 2) choose(n - 1);
    });
  }

  function renderWrite(q) {
    const l = q.item;
    const pad = writingPad(l.char, { guide: false });
    const guideBtn = h('button.btn.small', 'Show guide');
    guideBtn.onclick = () => (guideBtn.textContent = pad.toggleGuide() ? 'Hide guide' : 'Show guide');
    const done = h('button.btn.primary', 'Check');
    done.onclick = () => {
      const s = pad.score();
      if (s == null) return toast('Draw the letter first.');
      pad.toggleGuide(true);
      done.disabled = true;
      const ok = s >= 45;
      record(q, ok);
      if (ok) store.markLetter(opts.code, l.char);
      feedback(ok, { item: l.example }, `${l.char} (${l.roman}) — overlap ${s}%. ${ok ? '' : 'Compare with the guide.'}`);
    };
    add(body, 
      h('div.prompt', h('div.q', 'Write the letter for'), h('div.en-big', l.roman || l.char), h('div.muted.small', l.sound)),
      h('div.row', { style: { justifyContent: 'center' } }, pad.el),
      l.strokes ? h('p.small.muted.center', { style: { marginTop: '8px' } }, l.strokes) : null,
      h('div.row', { style: { justifyContent: 'center', marginTop: '10px' } }, h('button.btn.small', { onclick: () => pad.undo() }, 'Undo'), h('button.btn.small', { onclick: () => pad.clear() }, 'Clear'), guideBtn, done),
    );
    setKeys(null);
  }

  function renderNumber(q) {
    const n = q.item;
    const input = h('input.answer-input', { type: 'text', inputmode: 'numeric', placeholder: 'Type the number in digits' });
    const submit = h('button.btn.primary.block', { style: { marginTop: '12px' } }, 'Check');
    const check = () => {
      if (input.disabled || !input.value.trim()) return;
      const ok = parseInt(input.value.replace(/\D/g, ''), 10) === n.n;
      input.disabled = submit.disabled = true;
      results.push({ q, correct: ok });
      feedback(ok, { item: { native: n.native, roman: n.roman, en: String(n.n) } });
    };
    submit.onclick = check;
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), e.stopPropagation(), check()));
    const prompt = q.written
      ? h('div.prompt', h('div.q', 'Which number is this?'), nt(n.native, n.native.length > 14 ? 'long' : ''), rm(n.roman))
      : h('div.prompt', h('div.q', 'Listen — which number is it?'), h('div.row', audioBtn(n.native, { size: 'lg', auto: true, onFail: audioFailed }), audioBtn(n.native, { slow: true })));
    add(body, prompt, input, submit);
    setKeys(null);
    setTimeout(() => input.focus(), 50);
  }

  function show() {
    header();
    clear(body);
    const q = qs[i];
    ({ tip: renderTip, mc: renderMC, letter: renderLetter, letterIntro: renderLetterIntro, type: renderType, build: renderBuild, cloze: renderCloze, speak: renderSpeak, flash: renderFlash, intro: renderIntro, pair: renderPair, write: renderWrite, number: renderNumber })[q.type](q);
    const quiet = (label, kind, msg) =>
      body.appendChild(
        h('div.center.quiet', h('button.link-btn.small', { type: 'button', onclick: () => (stop(), pauseFor(kind), toast(msg), readapt()) }, label)),
      );
    if (needsAudio(q)) quiet("Can't listen now", 'listen', 'Listening questions are off for the next hour.');
    else if (q.type === 'speak') quiet("Can't speak now", 'speak', 'Speaking questions are off for the next hour.');
  }

  function finish() {
    setKeys(null);
    i = qs.length;
    header();
    const graded = results.filter((r) => r.q.type !== 'intro' && r.q.type !== 'letterIntro' && r.q.type !== 'tip');
    const right = graded.filter((r) => r.correct).length;
    const missed = distinctBy(
      graded.filter((r) => !r.correct && r.q.item),
      (r) => r.q.item.native || r.q.item.char,
    ).map((r) => r.q.item);
    const pct = graded.length ? Math.round((right / graded.length) * 100) : 100;
    const msg =
      opts.type === 'review'
        ? 'Reviewed. These will come back right before you would forget them.'
        : pct === 100
          ? 'Everything right. Well done.'
          : pct >= 80
            ? 'Solid work — a few to look at again.'
            : pct >= 50
              ? 'Good practice. The ones you missed are now first in your review queue.'
              : 'This is exactly how learning works — the misses are now in your review queue, and they will stick next time.';
    fill(body, 
      h(
        'div.center',
        { style: { padding: '10px 0 20px' } },
        graded.length ? h('div.score-ring', `${right} / ${graded.length}`) : h('div.score-ring', '✓'),
        h('p.muted', msg),
      ),
      missed.length
        ? h(
            'div.card.result-list',
            h('h3', 'To look at again'),
            h(
              'div.items',
              missed.slice(0, 12).map((it) =>
                it.char
                  ? h('div.item', h('span', nt(it.char)), h('div', h('div', it.roman, ' — ', h('span.muted', it.sound))))
                  : h('div.item', audioBtn(it.native), h('div', h('div.line1', nt(it.native), rm(it.roman, 'show')), h('div.en', it.en))),
              ),
            ),
          )
        : null,
      h(
        'div.row',
        { style: { justifyContent: 'center', marginTop: '20px' } },
        missed.length && opts.retry ? h('button.btn', { onclick: () => opts.retry(missed) }, 'Practise the missed ones') : null,
        h('button.btn.primary', { onclick: () => (opts.onContinue || opts.onExit)?.() }, opts.doneLabel || 'Done'),
      ),
    );
    opts.onDone?.({ right, total: graded.length, pct, missed });
  }

  if (!qs.length) {
    // everything here needs sound or the mic and that is switched off: offer to switch it back on
    const off = opts.questions.some((q) => needsAudio(q) && canSpeak(L.tts) && !listeningOn(L.tts)) ? 'listen' : opts.questions.some((q) => q.type === 'speak' && (canRecognize() || canRecord()) && !speakingOn()) ? 'speak' : null;
    const turnOn = () => {
      pauseFor(off, 0);
      store.setSetting(off === 'listen' ? 'listening' : 'speaking', true);
      runSession(root, opts);
    };
    fill(
      body,
      off
        ? h('div.empty', h('p', off === 'listen' ? 'Listening exercises are switched off right now.' : 'Speaking exercises are switched off right now.'), h('div.row', { style: { justifyContent: 'center' } }, h('button.btn', { onclick: () => opts.onExit?.() }, 'Back'), h('button.btn.primary', { onclick: turnOn }, 'Turn them on')))
        : h('div.empty', h('p', opts.emptyText || 'Nothing to practise here yet.'), h('button.btn', { onclick: () => opts.onExit?.() }, 'Back')),
    );
    return;
  }
  show();
}


const needsAudio = (q) => q.type === 'pair' || q.type === 'number' || q.from === 'audio' || q.mode === 'audio2roman' || q.listen;
function writtenVersion(q) {
  if (q.from === 'audio') return { ...q, from: 'native' };
  if (q.mode === 'audio2roman') return { ...q, mode: 'en2roman' };
  if (q.type === 'number') return { ...q, written: true };
  if (q.listen) return { ...q, listen: false };
  return null; // e.g. ear training: nothing to read instead
}

export function cardMeta(it) {
  return { kind: it.kind || (it.char ? 'letter' : 'word'), unit: it.unit || null };
}

// On-screen keyboard built from the script's letters.
export function keyboard(input, keys) {
  if (!keys || !keys.length) return null;
  const insert = (s) => {
    const st = input.selectionStart ?? input.value.length;
    const en = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, st) + s + input.value.slice(en);
    input.selectionStart = input.selectionEnd = st + s.length;
    input.focus();
  };
  const wrap = h(
    'div.kbd-wrap',
    keys.map((k) => h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => insert(k) }, k)),
    h('button.wide', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => insert(' ') }, 'space'),
    h(
      'button.wide',
      {
        type: 'button',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => {
          const chars = [...input.value];
          chars.pop();
          input.value = chars.join('');
          input.focus();
        },
      },
      '⌫',
    ),
  );
  return wrap;
}

// Helpers to build mixed sessions.
export function mixedQuestions(items, pool, { n = 12, kinds = ['meaning', 'recall', 'listen', 'typeRoman', 'build', 'dictation'], keys } = {}) {
  const chosen = sample(items, Math.min(n, items.length));
  return chosen.map((it, idx) => {
    let kind = kinds[idx % kinds.length];
    if (kind === 'build' && (it.kind !== 'phrase' || it.native.split(/\s+/).length < 2)) kind = 'meaning';
    if ((kind === 'typeRoman' || kind === 'dictation') && it.roman && it.roman.length > 28) kind = 'recall';
    if (kind === 'typeNative') return Q.typeNative(it, keys);
    return Q[kind](it, pool);
  });
}

// Full-sentence practice: fill the gap with the right form, put the words in order, understand,
// hear and translate. Long dialogue lines are kept to the kinds that stay manageable.
export function sentenceQuestions(items, pool, lex, { n = 12, kinds = ['cloze', 'build', 'meaning', 'cloze', 'listenBuild', 'typeRoman'] } = {}) {
  const chosen = sample(items, Math.min(n, items.length));
  return chosen.map((it, idx) => sentenceQuestion(it, kinds[idx % kinds.length], pool, lex));
}
export function sentenceQuestion(it, kind, pool, lex) {
  const len = words(it.native);
  if (kind === 'cloze') return Q.cloze(it, lex) || sentenceQuestion(it, 'build', pool, lex);
  if ((kind === 'build' || kind === 'listenBuild') && len > 9) return Q.cloze(it, lex) || Q.meaning(it, pool);
  if (kind === 'typeRoman' && (it.roman || '').length > 34) return sentenceQuestion(it, 'build', pool, lex);
  return Q[kind](it, pool);
}

// A lesson on the course path: the rule first (a quick tip), then the new words in threes, each
// group checked and then used straight away in a sentence, then the rest of the lesson's sentences.
export function lessonQuestions(lesson, { pool, sentencePool, lex }) {
  const qs = [];
  const sents = lesson.sentences;
  if (lesson.tip) qs.push(Q.tip(lesson.tip, [...sents.filter((s) => s.focus), ...sents.filter((s) => !s.focus)].slice(0, 2), lesson.notes));
  const used = new Set();
  const uses = (s, it) => {
    const t = tokens(s.native);
    const w = tokens(it.native);
    return w.length > 0 && w.every((x) => t.includes(x));
  };
  for (let i = 0; i < lesson.items.length; i += 3) {
    const group = lesson.items.slice(i, i + 3);
    group.forEach((it) => qs.push(Q.intro(it)));
    shuffle(group).forEach((it, j) => qs.push(it.kind === 'phrase' && tokens(it.native).length > 1 ? Q.build(it, pool) : j % 2 ? Q.recall(it, pool) : Q.meaning(it, pool)));
    for (const it of group) {
      const s = sents.find((x) => !used.has(x) && uses(x, it));
      if (!s) continue;
      used.add(s);
      qs.push(sentenceQuestion(s, s.focus ? 'cloze' : 'build', sentencePool, lex));
    }
  }
  const kinds = ['cloze', 'build', 'meaning', 'listenBuild', 'cloze', 'typeRoman', 'build'];
  sents.filter((s) => !used.has(s)).forEach((s, i) => qs.push(sentenceQuestion(s, kinds[i % kinds.length], sentencePool, lex)));
  return qs;
}

// A sentence with the word its rule is about highlighted.
export function marked(s) {
  const at = s.focus ? wordAt(s.native, s.focus) : -1;
  if (at < 0) return nt(s.native);
  return nt([s.native.slice(0, at), h('mark', s.focus), s.native.slice(at + s.focus.length)]);
}
// where a whole word starts in a sentence (not inside a longer word), or -1
function wordAt(text, word) {
  const edge = (c) => !c || /[\s?.!,।॥۔؟،:;"“”‘’()…–—]/.test(c);
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) if (edge(text[i - 1]) && edge(text[i + word.length])) return i;
  return -1;
}

// A sentence drill: a short session of sentence questions. Sentences you get right on the first
// go join your review deck, so the grammar keeps coming back.
export function sentenceDrill(host, { code, list, pool, lex, n, onExit, onDone, doneLabel = 'Back' }) {
  const questions = sentenceQuestions(list, pool, lex, { n: n || Math.min(10, list.length) });
  runSession(host, {
    code,
    learn: true,
    questions,
    onExit,
    doneLabel,
    retry: (missed) => runSession(host, { code, questions: sentenceQuestions(missed, pool, lex, { n: missed.length, kinds: ['build', 'cloze', 'meaning'] }), onExit }),
    onDone: (res) => {
      questions.forEach((q) => {
        const c = store.card(code, q.item.key);
        if (c && !c.reps && !res.missed.some((m) => m.native === q.item.native)) store.review(code, q.item.key, 2);
      });
      onDone?.(res);
    },
  });
}

// The four shapes of a joining letter, start → end as it is read (right to left).
export function formsRow(f) {
  return h(
    'div.forms',
    { dir: 'rtl' },
    POSITIONS.filter(([p]) => f[p]).map(([p, label]) => h('div.form', nt(f[p]), h('span.tiny.faint', { dir: 'ltr' }, p === 'alone' ? 'alone' : p))),
  );
}
