// The practice-session engine: renders one question at a time and reports results.

import { h, fill, add, clear, shuffle, sample, normRoman, englishMatches, similarity, toast } from './ui.js';
import { ctx, nt, rm, audioBtn, play, ICONS, writingPad } from './components.js';
import { canSpeak, canRecognize, recognize, canRecord, record as recordAudio, stop } from './audio.js';
import * as store from './store.js';

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
function distractors(item, pool, n, field) {
  const cands = distinctBy(
    pool.filter((p) => p[field] !== item[field] && p.native !== item.native && p.en !== item.en),
    (p) => p[field],
  );
  // prefer same kind & similar length so options aren't trivially guessable
  const len = (item[field] || '').length;
  const ranked = shuffle(cands).sort((a, b) => (a.kind === item.kind ? 0 : 1) - (b.kind === item.kind ? 0 : 1) || Math.abs((a[field] || '').length - len) - Math.abs((b[field] || '').length - len));
  return shuffle(ranked.slice(0, n * 3)).slice(0, n);
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
    const extra = shuffle(pool.filter((p) => p !== item && p.native.includes(' ')).flatMap((p) => p.native.split(/\s+/)))
      .filter((t) => !toks.includes(t) && !/^[?.!,।۔؟،]$/.test(t))
      .slice(0, Math.min(3, Math.max(1, 7 - toks.length)));
    return { type: 'build', item, tokens: shuffle([...toks, ...extra]), answer: toks };
  },
  speak: (item) => ({ type: 'speak', item }),
  flash: (item, front) => ({ type: 'flash', item, front }),
  intro: (item) => ({ type: 'intro', item }),
  pair: (pair) => {
    const which = Math.random() < 0.5 ? 'a' : 'b';
    return { type: 'pair', pair, which, item: pair[which] };
  },
  letterName: (l, letters) => {
    const opts = shuffle([l, ...distractors({ ...l, en: l.roman, native: l.char }, letters.map((x) => ({ ...x, en: x.roman, native: x.char })), 3, 'en').map((d) => letters.find((x) => x.char === d.char))]);
    return { type: 'letter', item: l, dir: 'char2roman', options: opts, answer: opts.indexOf(l) };
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
  const qs = opts.questions.filter((q) => {
    if (q.type === 'listen' || q.from === 'audio' || q.mode === 'audio2roman' || q.type === 'pair') return canSpeak(L.tts);
    if (q.type === 'speak') return canRecognize() || canRecord();
    return true;
  });
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
    );
  }

  function record(q, correct, grade) {
    results.push({ q, correct });
    if (opts.record === false || !q.item?.key) return;
    const key = q.item.key;
    const c = store.card(opts.code, key);
    if (grade != null) {
      store.ensureCard(opts.code, key, cardMeta(q.item));
      store.review(opts.code, key, grade);
    } else if (opts.learn) {
      store.ensureCard(opts.code, key, cardMeta(q.item));
    } else if (c && !correct) {
      c.due = Math.min(c.due, Date.now());
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
      ),
      h('div.row', it?.native ? audioBtn(it.native) : null, cont),
    );
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
    if (q.from === 'audio') return h('div.prompt', h('div.q', 'Listen. What does it mean?'), h('div.row', audioBtn(it.native, { size: 'lg', auto: true }), audioBtn(it.native, { slow: true })));
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
      h('button.opt', { onclick: () => choose(idx) }, h('span.k', idx + 1), q.dir === 'char2roman' ? h('span', o.roman || '—', h('span.muted.small', o.sound ? '  ' + shorten(o.sound) : '')) : nt(o.char)),
    );
    const choose = (idx) => {
      if (buttons[0].disabled) return;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === q.answer) b.classList.add('right');
        else if (j === idx) b.classList.add('wrong');
      });
      const ok = idx === q.answer;
      record(q, ok);
      if (ok) store.markLetter(opts.code, l.char);
      feedback(ok, { item: l.example ? { ...l.example } : null }, `${l.char} = ${l.roman}${l.ipa ? ' /' + l.ipa + '/' : ''}`);
    };
    add(body, 
      q.dir === 'char2roman'
        ? h('div.prompt', h('div.q', 'Which sound is this?'), nt(l.char, 'big-glyph'))
        : h('div.prompt', h('div.q', 'Find the letter for'), h('div.en-big', l.roman || '—'), h('div.muted', l.sound)),
      h('div.options' + (q.dir === 'roman2char' ? '.two' : ''), buttons),
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
    else if (q.mode === 'audio2roman') prompt = h('div.prompt', h('div.q', 'Dictation — type what you hear (romanization)'), h('div.row', audioBtn(it.native, { size: 'lg', auto: true }), audioBtn(it.native, { slow: true })));
    else prompt = h('div.prompt', h('div.q', `Translate — type it in ${L.script}`), h('div.en-big', it.en));
    const input = h('input.answer-input' + (q.mode === 'en2native' ? '.nt' : ''), {
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      dir: q.mode === 'en2native' && L.dir === 'rtl' ? 'rtl' : 'auto',
      lang: q.mode === 'en2native' ? L.code : 'en',
      placeholder: q.mode === 'en2native' ? 'Type here (use the keys below or your own keyboard)' : 'Type here…  (accents optional)',
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
    const chosen = [];
    const chips = q.tokens.map((t) => {
      const c = h('button.chip', { type: 'button' }, nt(t));
      c.onclick = () => {
        if (done) return;
        if (c.parentNode === bank) {
          const placeholder = h('span.chip.used', nt(t));
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
      const got = [...line.children].map((c) => c.textContent);
      if (!got.length) return;
      done = true;
      submit.disabled = true;
      const ok = got.join(' ') === q.answer.join(' ');
      record(q, ok);
      play(it.native);
      feedback(ok, q);
    };
    if (L.dir === 'rtl') line.dir = bank.dir = 'rtl';
    add(body, h('div.prompt', h('div.q', 'Build the sentence'), h('div.en-big', it.en)), line, bank, submit);
    setKeys(null);
  }

  function renderSpeak(q) {
    const it = q.item;
    const status = h('div.center.muted.small', canRecognize() ? 'Press the mic and say it.' : 'Record yourself, then compare with the model.');
    const meter = h('div.meter', h('i'));
    const mic = h('button.icon-btn.lg', { title: 'Speak', 'aria-label': 'Speak', html: ICONS.mic });
    const playback = h('div.row', { style: { justifyContent: 'center' } });
    let attempts = 0;
    const cont = h('button.btn.ghost.small', { onclick: () => (record(q, attempts > 0), next()) }, 'Skip');
    mic.onclick = async () => {
      if (mic.classList.contains('rec')) return;
      mic.classList.add('rec');
      attempts++;
      try {
        if (canRecognize()) {
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
    setKeys(null);
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
        if (opts2[j] === target) b.classList.add('right');
        else if (j === idx) b.classList.add('wrong');
      });
      results.push({ q, correct: ok });
      feedback(ok, { item: target }, pair.note || null);
    };
    add(body, h('div.prompt', h('div.q', 'Which word do you hear?'), h('div.row', audioBtn(target.native, { size: 'lg', auto: true }), audioBtn(target.native, { slow: true }))), h('div.options', buttons));
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
    add(body, h('div.prompt', h('div.q', 'Listen — which number is it?'), h('div.row', audioBtn(n.native, { size: 'lg', auto: true }), audioBtn(n.native, { slow: true }))), input, submit);
    setKeys(null);
    setTimeout(() => input.focus(), 50);
  }

  function show() {
    header();
    clear(body);
    const q = qs[i];
    ({ mc: renderMC, letter: renderLetter, type: renderType, build: renderBuild, speak: renderSpeak, flash: renderFlash, intro: renderIntro, pair: renderPair, write: renderWrite, number: renderNumber })[q.type](q);
  }

  function finish() {
    setKeys(null);
    i = qs.length;
    header();
    const graded = results.filter((r) => r.q.type !== 'intro');
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
        h('button.btn.primary', { onclick: () => opts.onExit?.() }, opts.doneLabel || 'Done'),
      ),
    );
    opts.onDone?.({ right, total: graded.length, pct, missed });
  }

  if (!qs.length) {
    fill(body, h('div.empty', h('p', opts.emptyText || 'Nothing to practise here yet.'), h('button.btn', { onclick: () => opts.onExit?.() }, 'Back')));
    return;
  }
  show();
}

function shorten(s) {
  s = String(s || '');
  return s.length > 38 ? s.slice(0, 36) + '…' : s;
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
