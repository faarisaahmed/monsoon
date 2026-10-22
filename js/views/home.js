import { h, fmtMinutes } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { weekChart } from './shared.js';
import { rain } from '../rain.js';
import { shareApp } from '../components.js';

export async function homeView() {
  const langs = await data.languages();
  langs.forEach((l) => data.loadFont(l.font));
  const started = langs.filter((l) => store.hasLang(l.code));
  const name = store.isGuest() ? null : store.displayName();
  const total = store.totalTime();

  const langCard = (l) => {
    const st = store.hasLang(l.code) ? store.cardStats(l.code) : null;
    const unitsDone = st ? Object.values(store.lang(l.code).units).filter((u) => u.check).length : 0;
    return h(
      'a.card.lang-card',
      { href: `#/l/${l.code}` },
      h('div.native', h('span.nt', { lang: l.code, style: { fontFamily: `"${l.font}", var(--ui)` } }, l.native)),
      h('h3', l.name),
      h('div.meta', st ? `${st.words} words · ${unitsDone}/${l.units} units` : `${l.script} · ${l.speakers}`),
      st ? h('div.bar.good', h('i', { style: { width: `${Math.round((unitsDone / l.units) * 100)}%` } })) : null,
    );
  };

  const sky = h(
    'section.sky',
    h('div.eyebrow', langs.map((l) => h('span.nt', { lang: l.code, style: { fontFamily: `"${l.font}", var(--ui)` } }, l.native))),
    name ? h('p.hello', `Welcome back, ${name}.`) : null,
    h('h1', 'Learn the languages of South Asia, properly.'),
    h(
      'p',
      `A complete, calm course for ${countWord(langs.length)} major languages of India, Pakistan, Bangladesh, Nepal and Sri Lanka: the script, how to really pronounce it, the words people actually use, grammar that makes sense, and practice that sticks.`,
    ),
    store.isGuest()
      ? h(
          'div.row',
          h('a.btn.primary', { href: '#/signup' }, 'Create a free account'),
          h('span.small.muted', 'or just pick a language — your progress is kept and moves into your account when you sign up.'),
        )
      : null,
  );
  rain(sky);

  return h(
    'div',
    sky,
    started.length
      ? h(
          'section.section',
          h('div.section-head', h('h2', 'Continue'), total ? h('span.small.muted', `${fmtMinutes(total)} studied in total`) : null),
          h('div.grid', started.map(continueCard(langs))),
          total ? h('div.card', { style: { marginTop: '14px' } }, h('div.row.between', h('strong', 'Your last 7 days'), h('span.small.muted', 'minutes studied')), weekChart(store.timeByDay(7))) : null,
        )
      : null,
    h('section.section', h('div.section-head', h('h2', started.length ? 'All languages' : 'Choose a language')), h('div.grid', langs.map(langCard))),
    h(
      'section.section',
      h('h2', 'How Monsoon works'),
      h(
        'div.how',
        how('Your own path', 'Start wherever you like: jump straight into speaking with romanization, or learn the script first. Nothing is locked, and you can mix both.'),
        how('Script & pronunciation', 'The writing system letter by letter (audio, stroke hints, a handwriting pad), plus lessons on the sounds English speakers find hard, with minimal pairs, ear training and a mic check.'),
        how('Twenty units', 'The same 20-unit path in every language, from greetings to telling stories: vocabulary, phrases, grammar and a dialogue in each.'),
        how('Review that sticks', 'Words you learn go into spaced repetition, so they come back right before you would forget them. No streaks, no points — just steady progress.'),
      ),
    ),
  );
}

const continueCard = (langs) => (l) => {
  const st = store.cardStats(l.code);
  const due = st.due;
  return h(
    'a.card',
    { href: `#/l/${l.code}` },
    h('div.row.between', h('span.nt', { lang: l.code, style: { fontSize: '1.5rem', fontFamily: `"${l.font}", var(--ui)` } }, l.native), due ? h('span.badge.accent', `${due} to review`) : h('span.badge.good', 'up to date')),
    h('h3', l.name),
    h('div.small.muted', `${st.words} words · ${st.mastered} well known · ${fmtMinutes(store.totalTime(l.code))}`),
  );
};

const how = (t, d) => h('div.card.flat', h('h3', t), h('p.small.muted', { style: { margin: 0 } }, d));

export async function aboutView() {
  const langs = await data.languages();
  return h(
    'div.prose',
    { 'data-title': 'About' },
    h('h1', 'About Monsoon'),
    h('p', 'Monsoon is a free, open-source course for the most widely spoken languages of South Asia — across India, Pakistan, Bangladesh, Nepal, Sri Lanka and the diaspora. The name is for the one thing the whole region shares. It aims to be the tool you would actually want: thorough enough to take you from zero to real conversations and reading, quiet enough that it never nags you.'),
    h('h2', 'Languages'),
    h('ul', langs.map((l) => h('li', h('strong', l.name), ` (${l.native}) — ${l.script} script · ${l.speakers}`))),
    h('h2', 'What each course contains'),
    h(
      'ul',
      h('li', 'The complete script: every vowel, vowel sign, consonant, special mark, common conjuncts and native digits — each with audio, IPA, a plain-English sound description, an example word and stroke hints.'),
      h('li', 'Pronunciation lessons with minimal pairs, ear-training quizzes, and speaking practice using your microphone.'),
      h('li', '20 units: vocabulary (≈500 words per language), useful phrases, grammar explanations with examples, a dialogue and cultural notes.'),
      h('li', 'Practice modes: flashcards, listening, dictation, translation, sentence building, speaking, handwriting, letter drills and numbers.'),
      h('li', 'Spaced-repetition review across everything you have learned.'),
      h('li', 'Reading room, numbers 0–100 and beyond, a searchable glossary and printable alphabet chart.'),
    ),
    h('h2', 'Audio'),
    h('p', 'Every word, phrase and sentence has a recorded clip made with natural-sounding neural voices, so audio works on any phone or computer without installing anything. (Sindhi is the exception: no speech voice exists for it yet, so its course relies on written pronunciation guides and recording yourself.) Recognition-based speaking checks work best in Chrome, Edge or Safari.'),
    h('h2', 'Accounts and your data'),
    h('p', 'Create a free account (email and password) and your progress syncs across your phone, tablet and computer. Everything is also kept on your device, so Monsoon works offline and catches up when you reconnect. You can use it without an account too, and whatever you do as a guest moves into your account when you sign up.'),
    h('h2', 'Philosophy'),
    h('p', 'No streaks, no hearts, no leaderboards. You will see how much you know and how much time you have put in, and the app will suggest a sensible next step. Missing a day costs you nothing.'),
    h('p', h('a', { href: 'https://github.com/faarisaahmed/monsoon' }, 'Source code and corrections on GitHub'), ' — native speakers, issues and pull requests are very welcome.'),
    h('p', 'If Monsoon helps you, and you know someone it might help too, you can ', h('button.linkish', { type: 'button', onclick: shareApp }, 'share it'), '. That is the only thing it will ever ask.'),
  );
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
const countWord = (n) => WORDS[n] || String(n);
