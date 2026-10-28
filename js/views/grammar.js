// The grammar handbook: every grammar point in the course, grouped by what it does, each with
// its explanation, examples and practice in full sentences.

import { h, add, clear, md, sample } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { exampleRow } from '../components.js';
import { stop } from '../audio.js';
import { sentenceDrill } from '../session.js';
import { crumbs } from './shared.js';

// Grammar points are sorted into topics by their titles; the first topic that matches wins.
const TOPICS = [
  { id: 'structure', title: 'Building sentences', desc: 'Word order, questions, and joining ideas: because, but, I think that…, relative clauses and reported speech.', re: /word order|written and spoken|two tamils|relative|reported|reporting|connector|linking|joining|\bjoin|because|story|natural|chaining|think that|opinion|quotative|idiom|proverb|filler|question/i },
  { id: 'polite', title: 'Requests, politeness and “if”', desc: 'Asking nicely, offering, “let’s…”, “shall I…?”, and real and imagined conditions.', re: /condition|\bif\b|subjunctive|let's|let me|'let|permission|would|wish|blessing|offer|polite|request|honorific|invit/i },
  { id: 'modal', title: 'Want, like, can and must', desc: 'The “to me” constructions for wanting, liking and feeling, and how to say can, should and have to.', re: /want|need|lik|'to me'|hunger|know|dative|experiencer|headache|wrong|should|must|have to|obligation|\bcan\b|ability|about to|going to|plan|intend|decided|feel/i },
  { id: 'place', title: 'Postpositions and cases', desc: 'In, on, to, from: the little words that come after the noun, and the forms nouns take before them.', re: /postposition|adposition|movement|where things|vocative|addressing|oblique|locative|direction|going places|\bto, from|object|accusative|there is|there are|i have|having|in \/ at|location/i },
  { id: 'verbs', title: 'Verbs and tenses', desc: '“To be”, the present, past and future, commands and negatives.', re: /tense|happening now|present|past|perfect|future|habit|continuous|ergative|transitive|imperative|command|negat|\bto be\b|copula|used to|was doing|irregular/i },
  { id: 'nouns', title: 'Nouns, pronouns and describing', desc: 'Gender and plurals, my and your, this and that, adjectives and comparing.', re: /pronoun|intensif|'you'|\byou\b|gender|plural|possess|\bmy\b|demonstrative|this and that|this, that|adjective|compar|classifier|wala|वाला|ਵਾਲਾ|વાળું|one'|\bone,/i },
  { id: 'everyday', title: 'Numbers, time and everyday patterns', desc: 'Counting things, age, prices, telling the time and talking about the weather.', re: /./ },
];

// The order topics appear on the page: from the shape of a sentence outwards.
const ORDER = ['structure', 'nouns', 'place', 'verbs', 'modal', 'polite', 'everyday'];

// "Numbers, time…" is the catch-all, but titles about time, numbers or weather go there first.
const EVERYDAY = /telling the time|time expressions|days|weather|numbers with|counting|how many|how much|how old|age\b|ordinal|fraction|price/i;

function points(units) {
  return units.flatMap((u) =>
    u.grammar.map((g, gi) => ({ g, gi, u, topic: EVERYDAY.test(g.title) && !/question|condition/i.test(g.title) ? 'everyday' : TOPICS.find((t) => t.re.test(g.title)).id })),
  );
}

// The first sentence of a point's explanation, without markdown, as a one-line summary.
function gist(body) {
  const plain = body.split('\n').find((l) => l.trim()) || '';
  const s = plain.replace(/[*`]|__/g, '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^.{20,}?[.!?](\s|$)/);
  const one = (m ? m[0] : s).trim();
  return one.length > 140 ? one.slice(0, 137).trimEnd() + '…' : one;
}

const pointHref = (code, p) => `#/l/${code}/grammar/${p.u.id}-${p.gi + 1}`;

export async function grammarHub({ code, L }) {
  const units = await data.allUnits(code);
  const all = points(units);
  const first = all[0];
  const read = (p) => store.hasLang(code) && store.unitState(code, p.u.id).grammar;
  const readCount = all.filter(read).length;
  return h(
    'div',
    { 'data-title': 'Grammar' },
    crumbs([L.name, `#/l/${code}`], ['Reference', `#/l/${code}/reference`], ['Grammar']),
    h('h1', 'Grammar & sentence structure'),
    h(
      'p.muted',
      { style: { maxWidth: '66ch' } },
      `All ${all.length} grammar points from the course in one place, grouped by what they do. The course teaches each one in a lesson, with a quick tip first. Come here to read the full notes again or to practise a rule on its own.`,
    ),
    h(
      'div.card.next-card',
      { style: { marginTop: '16px' } },
      h('div', h('h3', { style: { margin: '0 0 2px' } }, 'Sentence workout'), h('div.small.muted', 'Full sentences from the units you have reached: fill the gap with the right form, put the words in order, translate.')),
      h('div.row', h('a.btn.accent', { href: `#/l/${code}/practice/grammar` }, 'Start a workout')),
    ),
    readCount ? h('p.small.muted', `${readCount} of ${all.length} read in the course · ✓ marks the ones you have read`) : null,
    first
      ? h(
          'div.callout',
          { style: { margin: '16px 0 0', maxWidth: '72ch' } },
          h('strong', 'Start here. '),
          `The one rule that shapes every ${L.name} sentence: `,
          h('a', { href: pointHref(code, first) }, first.g.title),
          '.',
        )
      : null,
    h(
      'nav.topic-jump',
      ORDER.map((id) => {
        const t = TOPICS.find((x) => x.id === id);
        const n = all.filter((p) => p.topic === id).length;
        return n ? h('a', { href: `#/l/${code}/grammar?to=t-${id}` }, t.title, h('span.tiny.faint', ` ${n}`)) : null;
      }),
    ),
    ORDER.map((id) => {
      const t = TOPICS.find((x) => x.id === id);
      const list = all.filter((p) => p.topic === id);
      if (!list.length) return null;
      return h(
        'section.section',
        { id: 't-' + id },
        h('div.section-head', h('h2', t.title), h('span.small.muted', `${list.length} points`)),
        h('p.small.muted', { style: { margin: '-4px 0 12px', maxWidth: '66ch' } }, t.desc),
        h(
          'div.unit-list',
          list.map((p) =>
            h(
              'a.unit-row' + (read(p) ? '.done' : ''),
              { href: pointHref(code, p) },
              h('span.unit-num', { title: `Unit ${p.u.id}` }, p.u.id),
              h('div', h('div.t', p.g.title), h('div.g', gist(p.g.body))),
              h('span.small.muted', read(p) ? '✓' : ''),
            ),
          ),
        ),
      );
    }),
  );
}

export async function grammarPoint({ code, L, params }) {
  const [units, lex] = await Promise.all([data.allUnits(code), data.lexicon(code)]);
  const all = points(units);
  const i = all.findIndex((p) => p.u.id === +params[1] && p.gi === +params[2] - 1);
  if (i < 0) return h('div.empty', h('h2', 'Not found'), h('p', 'That grammar point does not exist.'), h('a.btn', { href: `#/l/${code}/grammar` }, 'All grammar'));
  const p = all[i];
  const t = TOPICS.find((x) => x.id === p.topic);
  const pool = units.flatMap((u) => data.unitSentenceItems(u));
  const own = data.unitSentenceItems(p.u).filter((s) => s.grammar === p.gi);
  const related = all.filter((x) => x.topic === p.topic && x !== p);
  const area = h('div');

  function practise() {
    stop();
    clear(area);
    const host = h('div');
    add(area, host);
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // a few sentences from the same topic in earlier units keep the older points alive too
    const earlier = pool.filter((s) => s.unit < p.u.id && s.grammar != null && all.find((x) => x.u.id === s.unit && x.gi === s.grammar)?.topic === p.topic);
    const list = own.length >= 8 || !earlier.length ? own : [...own, ...sample(earlier, 8 - own.length)];
    sentenceDrill(host, { code, list, pool, lex, n: Math.min(10, list.length), onExit: () => clear(area), doneLabel: 'Close' });
  }

  return h(
    'div',
    { 'data-title': p.g.title },
    crumbs([L.name, `#/l/${code}`], ['Reference', `#/l/${code}/reference`], ['Grammar', `#/l/${code}/grammar`], [t.title, `#/l/${code}/grammar?to=t-${t.id}`]),
    h('div.small.muted', `Unit ${p.u.id}: ${p.u.title}`),
    h('h1', { style: { marginTop: '4px' } }, p.g.title),
    h('div.grammar', md(p.g.body), h('div.examples', p.g.examples.map(exampleRow))),
    h(
      'div.card.next-card',
      { style: { marginTop: '20px' } },
      h('div', h('h3', { style: { margin: '0 0 2px' } }, 'Practise it in sentences'), h('div.small.muted', own.length ? `${own.length} sentences use this point: fill the gap, build, hear and translate. The ones you get right join your reviews.` : 'Practise with sentences from this unit.')),
      h('div.row', h('a.btn', { href: `#/l/${code}/u/${p.u.id}?to=notes` }, 'See it in the unit'), h('button.btn.primary', { onclick: practise }, 'Practise')),
    ),
    area,
    related.length
      ? h(
          'section.section',
          h('h3', `More on ${t.title.toLowerCase()}`),
          h(
            'div.unit-list',
            related.map((x) => h('a.unit-row', { href: pointHref(code, x) }, h('span.unit-num', x.u.id), h('div', h('div.t', x.g.title)), h('span'))),
          ),
        )
      : null,
    h('hr'),
    h(
      'div.row.between',
      i > 0 ? h('a.btn.ghost', { href: pointHref(code, all[i - 1]) }, '← ' + all[i - 1].g.title) : h('span'),
      i < all.length - 1 ? h('a.btn.ghost', { href: pointHref(code, all[i + 1]) }, all[i + 1].g.title + ' →') : h('span'),
    ),
  );
}
