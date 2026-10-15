// Conversation practice, no AI: role-play the course dialogues, and answer open questions in
// your own words (saved to a journal, with example answers from the course to compare against).

import { h, fill, add, clear, normRoman, similarity, toast, pick, modal } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { nt, rm, audioBtn, play, ICONS, ctx } from '../components.js';
import { canRecognize, recognize, listeningOn, speakingOn, stop } from '../audio.js';
import { crumbs } from './shared.js';
import { notFound } from './lang.js';

// Wait for a line to be spoken, but never get stuck on audio that doesn't report finishing.
const say = (text) => Promise.race([Promise.resolve(play(text)), new Promise((r) => setTimeout(r, 2500 + text.length * 120))]);
const isQuestion = (t) => /[?؟]\s*$/.test((t || '').trim());
const strip = (t) => (t || '').replace(/[\s?.!,;:।۔؟،—–-]/g, '');

// How close a typed line is to the model line, in either romanization or the script.
function closeness(typed, line) {
  if (/[a-z]/i.test(typed)) return similarity(normRoman(typed).replace(/ /g, ''), normRoman(line.roman).replace(/ /g, ''));
  return similarity(strip(typed), strip(line.native));
}

// Units you have opened or learned from (at least the first two), so questions use familiar words.
function reachedUnits(code, units) {
  const learned = new Set();
  if (store.hasLang(code)) {
    for (const c of Object.keys(store.lang(code).cards)) {
      const it = units.flatMap((u) => data.unitItems(code, u)).find((x) => x.key === c);
      if (it) learned.add(it.unit);
    }
    for (const [n, st] of Object.entries(store.lang(code).units)) if (Object.keys(st).length) learned.add(+n);
  }
  const max = Math.max(2, ...learned);
  return units.filter((u) => u.id <= max);
}

// Every question in the course, with the course's own answers to it: the phrases that follow
// a question phrase, and the reply to a question line in a dialogue.
function questionBank(units) {
  const out = [];
  for (const u of units) {
    u.phrases.forEach((p, i) => {
      if (!isQuestion(p.native) && !isQuestion(p.en)) return;
      const answers = [];
      for (let j = i + 1; j < u.phrases.length && answers.length < 3; j++) {
        if (isQuestion(u.phrases[j].native) || isQuestion(u.phrases[j].en)) break;
        answers.push(u.phrases[j]);
      }
      out.push({ q: p, answers, unit: u.id });
    });
    const lines = u.dialogue?.lines || [];
    lines.forEach((l, i) => {
      const reply = lines[i + 1];
      if (isQuestion(l.native) && reply && reply.speaker !== l.speaker && !out.some((x) => x.q.native === l.native)) out.push({ q: l, answers: [reply], unit: u.id });
    });
  }
  return out;
}

// ---------- hub ----------
export async function talkView({ code, L }) {
  const units = await data.allUnits(code);
  const reach = reachedUnits(code, units);
  const bank = questionBank(reach);
  const answerArea = h('div');

  const entries = h('div.stack');
  const renderJournal = () => {
    const list = store.journal(code);
    fill(
      entries,
      list.length
        ? list.map((e) => journalEntry(code, e, renderJournal))
        : h('p.small.muted', 'Answers you save will appear here, so you can look back and see how far you have come.'),
    );
  };
  renderJournal();

  const newQuestion = (avoid) => {
    const choices = bank.filter((b) => b.q.native !== avoid);
    if (!choices.length) return;
    fill(answerArea, answerCard(code, pick(choices), { onSaved: renderJournal, onNext: (cur) => newQuestion(cur) }));
  };
  if (bank.length) newQuestion();

  return h(
    'div',
    { 'data-title': 'Conversation' },
    crumbs([L.name, `#/l/${code}`], ['Conversation']),
    h('h1', 'Conversation'),
    h('p.muted', { style: { maxWidth: '64ch' } }, 'Practise actually talking: take a part in a dialogue, or answer a question in your own words. Type in romanization or the script, whichever you like.'),
    h(
      'section.section',
      h('div.section-head', h('h2', 'Answer a question'), h('span.small.muted', `From units 1–${reach[reach.length - 1].id}`)),
      bank.length ? answerArea : h('p.muted', 'No questions yet.'),
    ),
    h(
      'section.section',
      h('div.section-head', h('h2', 'Role-play'), h('span.small.muted', 'Pick a dialogue and a part')),
      h(
        'div.unit-list',
        units
          .filter((u) => u.dialogue?.lines?.length)
          .map((u) => {
            const speakers = [...new Set(u.dialogue.lines.map((l) => l.speaker).filter(Boolean))];
            return h(
              'div.unit-row.roleplay-row',
              h('span.unit-num', u.id),
              h('div', h('div.t', u.dialogue.title || u.title), h('div.g', u.title)),
              h(
                'div.row',
                speakers.slice(0, 3).map((s) => h('a.btn.small', { href: `#/l/${code}/talk/${u.id}?as=${encodeURIComponent(s)}`, title: `Play ${s}` }, s)),
              ),
            );
          }),
      ),
    ),
    h('section.section', h('div.section-head', h('h2', 'Your answers'), h('span.small.muted', 'Saved to your account')), entries),
  );
}

function answerCard(code, b, { onSaved, onNext }) {
  const q = b.q;
  const showEn = h('button.link-btn.small', { type: 'button' }, 'Show English');
  const en = h('div.muted.hide', q.en);
  showEn.onclick = () => (en.classList.remove('hide'), showEn.remove());
  const box = h('textarea.answer-box', { rows: 3, placeholder: 'Your answer — in romanization or the script', autocapitalize: 'off', spellcheck: false });
  const examples = h('div');
  const reveal = h('button.btn', { type: 'button' }, 'Example answers');
  reveal.onclick = () => {
    reveal.remove();
    fill(
      examples,
      h('div.small.muted', { style: { margin: '12px 0 6px' } }, b.answers.length ? 'How the course answers it (yours can be completely different):' : 'No example answer for this one — anything that makes sense is right.'),
      b.answers.map((a) => h('div.ex', audioBtn(a.native, { size: 'sm' }), h('div', h('div', nt(a.native), ' ', rm(a.roman)), h('div.small', a.en)))),
    );
  };
  const save = h('button.btn.primary', { type: 'button' }, 'Save answer');
  save.onclick = () => {
    const text = box.value.trim();
    if (!text) return box.focus();
    store.saveEntry(code, { prompt: { native: q.native, roman: q.roman, en: q.en }, text, unit: b.unit });
    toast('Saved.');
    onSaved();
    onNext(q.native);
  };
  const mic =
    canRecognize(ctx.lang.tts) && speakingOn()
      ? h('button.icon-btn', { type: 'button', title: 'Say your answer', 'aria-label': 'Say your answer', html: ICONS.mic })
      : null;
  if (mic)
    mic.onclick = async () => {
      if (mic.classList.contains('rec')) return;
      mic.classList.add('rec');
      try {
        const alts = await recognize(ctx.lang.tts);
        if (alts[0]) box.value = (box.value.trim() + ' ' + alts[0]).trim();
        else toast('Nothing heard — try again.');
      } catch (e) {
        toast(e.message);
      }
      mic.classList.remove('rec');
    };
  if (listeningOn(ctx.lang.tts)) setTimeout(() => box.isConnected && play(q.native), 300);
  return h(
    'div.card',
    h('div.row', nt(q.native, q.native.length > 14 ? 'long' : ''), audioBtn(q.native)),
    rm(q.roman),
    h('div.row', { style: { gap: '8px', marginTop: '4px' } }, showEn),
    en,
    h('div.row', { style: { marginTop: '12px', alignItems: 'flex-start', flexWrap: 'nowrap' } }, box, mic),
    examples,
    h('div.row', { style: { marginTop: '12px' } }, save, reveal, h('button.btn.ghost', { type: 'button', onclick: () => onNext(q.native) }, 'Another question')),
  );
}

function journalEntry(code, e, rerender) {
  const date = new Date(e.at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const del = h('button.link-btn.tiny', { type: 'button' }, 'Delete');
  del.onclick = async () => {
    if (!(await modal('Delete this answer?', 'It will be removed on all your devices.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, danger: true }]))) return;
    store.deleteEntry(code, e.id);
    rerender();
  };
  if (e.kind === 'roleplay') {
    return h(
      'div.card.journal',
      h('div.row.between', h('strong', e.title), h('span.tiny.faint', date, ' · ', del)),
      e.turns.map((t) => h('div.turn', h('div.small.muted', t.en), h('div', /[a-z]/i.test(t.text) ? t.text : nt(t.text)), h('div.small.faint', 'Dialogue: ', nt(t.native), ' ', rm(t.roman)))),
    );
  }
  return h(
    'div.card.journal',
    h('div.row.between', h('div', audioBtn(e.prompt.native, { size: 'sm' }), ' ', nt(e.prompt.native)), h('span.tiny.faint', date, ' · ', del)),
    h('div.small.muted', e.prompt.en),
    h('div.journal-text', /[a-z]/i.test(e.text) ? e.text : nt(e.text)),
  );
}

// ---------- role-play ----------
export async function roleplayView({ code, L, params, query }) {
  const n = parseInt(params[1], 10);
  if (!(n >= 1 && n <= L.units)) return notFound(code, 'That unit does not exist.');
  const u = await data.unit(code, n);
  const d = u.dialogue;
  const speakers = [...new Set(d.lines.map((l) => l.speaker).filter(Boolean))];
  const me = speakers.includes(query.get('as')) ? query.get('as') : speakers[speakers.length > 1 ? 1 : 0];
  const other = speakers.find((s) => s !== me);
  const chat = h('div.chat');
  const panel = h('div');
  const turns = [];
  let i = 0;

  const bubble = (l, side, extra) =>
    h(
      'div.bubble.' + side,
      h('div.tiny.faint', l.speaker),
      h('div.row', { style: { gap: '6px', flexWrap: 'nowrap' } }, nt(l.native), audioBtn(l.native, { size: 'sm' })),
      rm(l.roman),
      h('div.small.muted', l.en),
      extra,
    );

  async function step() {
    while (i < d.lines.length && d.lines[i].speaker !== me) {
      const l = d.lines[i++];
      chat.appendChild(bubble(l, 'them'));
      chat.lastChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (listeningOn(L.tts)) await say(l.native);
      await new Promise((r) => setTimeout(r, 450));
      if (!chat.isConnected) return;
    }
    if (i >= d.lines.length) return finish();
    yourTurn(d.lines[i]);
  }

  function yourTurn(l) {
    const input = h('input.answer-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Type it — romanization or script' });
    const check = h('button.btn.primary', { type: 'button' }, 'Check');
    const giveUp = h('button.btn.ghost', { type: 'button' }, 'Show me');
    const mic =
      canRecognize(L.tts) && speakingOn()
        ? h('button.icon-btn', { type: 'button', title: 'Say it', 'aria-label': 'Say it', html: ICONS.mic })
        : null;
    const done = (typed) => {
      stop();
      const s = typed ? closeness(typed, l) : 0;
      const verdict = !typed ? null : s >= 0.9 ? 'Spot on.' : s >= 0.7 ? 'Close — compare the details.' : 'The dialogue says it differently. Your version might still work; compare.';
      turns.push({ en: l.en, native: l.native, roman: l.roman, text: typed || '' });
      clear(panel);
      chat.appendChild(
        bubble(l, 'me', typed ? h('div.you', h('span.tiny.faint', 'You: '), /[a-z]/i.test(typed) ? typed : nt(typed), h('div.tiny' + (s >= 0.7 ? '.good-text' : '.faint'), verdict)) : null),
      );
      chat.lastChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      i++;
      const go = () => step();
      if (listeningOn(L.tts)) say(l.native).then(() => setTimeout(go, 500));
      else setTimeout(go, 600);
    };
    check.onclick = () => (input.value.trim() ? done(input.value.trim()) : input.focus());
    giveUp.onclick = () => done('');
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), check.click()));
    if (mic)
      mic.onclick = async () => {
        if (mic.classList.contains('rec')) return;
        mic.classList.add('rec');
        try {
          const alts = await recognize(L.tts);
          const best = alts.sort((a, b) => closeness(b, l) - closeness(a, l))[0];
          if (best) input.value = best;
          else toast('Nothing heard — try again.');
        } catch (e) {
          toast(e.message);
        }
        mic.classList.remove('rec');
      };
    fill(
      panel,
      h(
        'div.card.your-turn',
        h('div.small.muted', `Your turn, ${me}. Say:`),
        h('div.en-big', l.en),
        h('div.row', { style: { flexWrap: 'nowrap', marginTop: '10px' } }, input, mic),
        h('div.row', { style: { marginTop: '10px' } }, check, giveUp),
      ),
    );
    setTimeout(() => input.focus(), 50);
  }

  function finish() {
    const said = turns.filter((t) => t.text);
    fill(
      panel,
      h(
        'div.card.center',
        h('h3', 'End of the conversation'),
        h('p.muted.small', said.length ? `You said ${said.length} of your ${turns.length} lines yourself.` : 'Next time, try typing your lines before looking.'),
        h(
          'div.row',
          { style: { justifyContent: 'center' } },
          said.length
            ? h('button.btn', {
                type: 'button',
                onclick: (e) => {
                  store.saveEntry(code, { kind: 'roleplay', title: `${d.title || u.title} — as ${me}`, unit: n, turns });
                  e.target.disabled = true;
                  e.target.textContent = 'Saved';
                },
              }, 'Save my lines')
            : null,
          other ? h('a.btn', { href: `#/l/${code}/talk/${n}?as=${encodeURIComponent(other)}` }, `Play ${other}`) : null,
          h('a.btn.primary', { href: `#/l/${code}/talk` }, 'Done'),
        ),
      ),
    );
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  setTimeout(step, 300);
  return h(
    'div',
    { 'data-title': 'Role-play' },
    crumbs([L.name, `#/l/${code}`], ['Conversation', `#/l/${code}/talk`], [`Unit ${n}`]),
    h('h1', d.title || u.title),
    d.setting ? h('p.muted.small', { style: { maxWidth: '64ch' } }, d.setting) : null,
    h('p.small', `You are `, h('strong', me), other ? ` talking with ${other}.` : '.', ' When it is your turn you see what to say in English.'),
    chat,
    panel,
  );
}
