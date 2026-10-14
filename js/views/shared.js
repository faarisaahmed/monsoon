import { h } from '../ui.js';

export function weekChart(days) {
  const max = Math.max(60 * 10, ...days.map((d) => d.seconds));
  return h(
    'div.week',
    { style: { marginTop: '10px' } },
    days.map((d) =>
      h(
        'div',
        { title: `${d.date.toLocaleDateString(undefined, { weekday: 'long' })}: ${Math.round(d.seconds / 60)} min` },
        h('i' + (d.seconds ? '' : '.zero'), { style: { height: `${Math.max(3, (d.seconds / max) * 100)}%` } }),
        h('span', d.date.toLocaleDateString(undefined, { weekday: 'narrow' })),
      ),
    ),
  );
}

export const crumbs = (...parts) =>
  h(
    'div.crumbs',
    parts.map((p, i) => [i ? ' / ' : null, p[1] ? h('a', { href: p[1] }, p[0]) : h('span', p[0])]),
  );

export const back = (href, label = 'Back') => h('a.btn.ghost.small', { href }, '← ', label);
