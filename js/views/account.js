import { h, toast, modal, go, fmtMinutes } from '../ui.js';
import * as store from '../store.js';
import * as data from '../data.js';
import { voicesFor, speak, canRecognize } from '../audio.js';
import { weekChart } from './shared.js';

function form(fields, submitLabel, onSubmit) {
  const err = h('p.small', { style: { color: 'var(--bad)', minHeight: '1.2em' } });
  const btn = h('button.btn.primary.block', { type: 'submit' }, submitLabel);
  const f = h('form', fields, err, btn);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(f)));
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
  return f;
}
const field = (label, input) => h('label.field', h('span', label), input);

export function loginView({ query }) {
  const next = query.get('next') || '/';
  const accounts = store.accountList();
  return h(
    'div.auth',
    { 'data-title': 'Sign in' },
    h('h1', 'Sign in'),
    form(
      [
        field('Username', h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, value: accounts.length === 1 ? accounts[0] : '' })),
        field('Password', h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true })),
        h('label.check.small', { style: { marginBottom: '14px' } }, h('input', { type: 'checkbox', name: 'remember', checked: true }), 'Keep me signed in on this device'),
      ],
      'Sign in',
      async (v) => {
        await store.login(v.username, v.password, !!v.remember);
        toast(`Welcome back, ${store.displayName()}.`);
        go(next);
      },
    ),
    h('p.small.muted', { style: { marginTop: '18px' } }, 'New here? ', h('a', { href: '#/signup' }, 'Create an account'), '.'),
    h('p.small.muted', 'Moving from another device? ', h('a', { href: '#/account?to=data' }, 'Import your progress file'), ' — it brings your account with it.'),
  );
}

export function signupView() {
  const guestHas = store.isGuest() && store.startedLangs().length > 0;
  return h(
    'div.auth',
    { 'data-title': 'Create account' },
    h('h1', 'Create an account'),
    h('p.muted.small', 'Your account keeps your progress, settings and review schedule for every language. It lives in this browser — nothing is uploaded — and you can export it to move to another device.'),
    form(
      [
        field('Your name (optional)', h('input', { type: 'text', name: 'name', autocomplete: 'nickname' })),
        field('Username', h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, minlength: 3, pattern: '[A-Za-z0-9_.\\-]{3,32}' })),
        field('Password (6+ characters)', h('input', { type: 'password', name: 'password', autocomplete: 'new-password', required: true, minlength: 6 })),
        field('Confirm password', h('input', { type: 'password', name: 'confirm', autocomplete: 'new-password', required: true })),
        guestHas ? h('label.check.small', { style: { marginBottom: '14px' } }, h('input', { type: 'checkbox', name: 'keep', checked: true }), 'Keep the progress I made as a guest') : null,
      ],
      'Create account',
      async (v) => {
        if (v.password !== v.confirm) throw new Error('Passwords do not match.');
        await store.signup(v.username, v.password, v.name, { keepGuest: guestHas ? !!v.keep : true });
        toast('Account created. Welcome!');
        go(store.lastLang() ? `/l/${store.lastLang()}` : '/');
      },
    ),
    h('p.small.muted', { style: { marginTop: '18px' } }, 'Already have one? ', h('a', { href: '#/login' }, 'Sign in'), '.'),
  );
}

export async function accountView() {
  const s = store.settings();
  const langs = await data.languages();
  const guest = store.isGuest();

  const seg = (key, options) => {
    const wrap = h('div.seg');
    options.forEach(([val, label]) => {
      const b = h('button' + (s[key] === val ? '.on' : ''), { type: 'button' }, label);
      b.onclick = () => {
        store.setSetting(key, val);
        [...wrap.children].forEach((c) => c.classList.remove('on'));
        b.classList.add('on');
      };
      wrap.appendChild(b);
    });
    return wrap;
  };

  // ----- profile
  const pwForm = guest
    ? null
    : form(
        [
          field('Current password', h('input', { type: 'password', name: 'old', autocomplete: 'current-password', required: true })),
          field('New password', h('input', { type: 'password', name: 'new', autocomplete: 'new-password', required: true, minlength: 6 })),
        ],
        'Change password',
        async (v) => {
          await store.changePassword(v.old, v.new);
          pwForm.reset();
          toast('Password changed.');
        },
      );
  const profile = guest
    ? h(
        'div.card',
        h('h2', 'You are using Monsoon as a guest'),
        h('p.muted', 'Your progress is saved in this browser. Create an account to keep it under your name, protect it with a password, and share this device with others.'),
        h('div.row', h('a.btn.primary', { href: '#/signup' }, 'Create account'), h('a.btn', { href: '#/login' }, 'Sign in')),
      )
    : h(
        'div.card',
        h('div.row.between', h('h2', { style: { margin: 0 } }, store.displayName()), h('button.btn.small', { onclick: () => (store.logout(), toast('Signed out.'), go('/')) }, 'Sign out')),
        h('p.small.muted', `Username: ${store.currentUser()}`),
        h(
          'details',
          h('summary.small', 'Change name or password'),
          h(
            'div',
            { style: { marginTop: '12px' } },
            form([field('Display name', h('input', { type: 'text', name: 'name', value: store.displayName() }))], 'Save name', async (v) => {
              store.renameDisplay(v.name);
              toast('Saved.');
              go('/account?keep=1&t=' + Date.now());
            }),
            h('hr'),
            pwForm,
          ),
        ),
      );

  // ----- progress
  const started = langs.filter((l) => store.hasLang(l.code));
  const progress = h(
    'div.card',
    h('h2', 'Your progress'),
    started.length
      ? [
          h('p.muted.small', `${fmtMinutes(store.totalTime())} studied in total.`),
          weekChart(store.timeByDay(14)),
          h(
            'div.table-wrap',
            { style: { marginTop: '16px' } },
            h(
              'table',
              h('tr', h('th', 'Language'), h('th', 'Words'), h('th', 'Well known'), h('th', 'Units done'), h('th', 'Time'), h('th', '')),
              started.map((l) => {
                const st = store.cardStats(l.code);
                const done = Object.values(store.lang(l.code).units).filter((u) => u.check).length;
                return h(
                  'tr',
                  h('td', h('a', { href: `#/l/${l.code}` }, l.name)),
                  h('td', st.words),
                  h('td', st.mastered),
                  h('td', `${done}/${l.units}`),
                  h('td', fmtMinutes(store.totalTime(l.code))),
                  h(
                    'td',
                    h(
                      'button.btn.ghost.small.danger',
                      {
                        onclick: async () => {
                          if (await modal(`Reset ${l.name}?`, `This deletes all ${l.name} progress for this account. It cannot be undone.`, [{ label: 'Cancel', value: false }, { label: 'Reset', value: true, danger: true }])) {
                            store.resetLanguage(l.code);
                            go('/account?keep=1&t=' + Date.now());
                          }
                        },
                      },
                      'Reset',
                    ),
                  ),
                );
              }),
            ),
          ),
        ]
      : h('p.muted', 'Nothing yet — pick a language to begin.'),
  );

  // ----- learning settings
  const goal = h('input', { type: 'number', min: 0, max: 240, step: 5, value: s.dailyGoal, style: { width: '90px' } });
  goal.onchange = () => store.setSetting('dailyGoal', Math.max(0, parseInt(goal.value, 10) || 0));
  const newPer = h('input', { type: 'number', min: 3, max: 20, value: s.newPerSession, style: { width: '90px' } });
  newPer.onchange = () => store.setSetting('newPerSession', Math.min(20, Math.max(3, parseInt(newPer.value, 10) || 8)));

  const learning = h(
    'div.card',
    h('h2', 'Learning'),
    h('div.stack',
      h('div', h('div.small.muted', 'Romanization (Latin-letter spelling)'), seg('roman', [['show', 'Always show'], ['tap', 'Tap to reveal'], ['hide', 'Hide']]), h('p.tiny.faint', { style: { marginTop: '4px' } }, 'Once you can read the script, switch to "Tap to reveal" — it makes a big difference.')),
      h('div', h('div.small.muted', 'New words per learning session'), newPer),
      h('div', h('div.small.muted', 'Daily time you would like to spend (minutes, optional)'), goal, h('p.tiny.faint', { style: { marginTop: '4px' } }, 'Just a gentle guide shown on the overview. Set 0 to hide it. There are no streaks — missing a day costs nothing.')),
      h('div', h('div.small.muted', 'Theme'), seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])),
    ),
  );

  // ----- audio
  const rate = h('input', { type: 'range', min: 0.5, max: 1.2, step: 0.05, value: s.rate, style: { width: '200px' } });
  const rateLabel = h('span.small.muted', ` ${s.rate}×`);
  rate.oninput = () => {
    rateLabel.textContent = ` ${rate.value}×`;
    store.setSetting('rate', parseFloat(rate.value));
  };
  const online = h('input', { type: 'checkbox', checked: s.onlineVoice });
  online.onchange = () => store.setSetting('onlineVoice', online.checked);
  const voiceRows = langs.map((l) => {
    const vs = voicesFor(l.tts);
    const sel = h('select', { style: { maxWidth: '260px' } }, h('option', { value: '' }, vs.length ? 'Automatic' : 'No device voice'), vs.map((v) => h('option', { value: v.voiceURI, selected: s.voices?.[l.tts] === v.voiceURI }, `${v.name} (${v.lang})`)));
    sel.disabled = !vs.length;
    sel.onchange = () => store.setSetting('voices', { ...store.settings().voices, [l.tts]: sel.value });
    return h('tr', h('td', l.name), h('td', sel), h('td', h('button.btn.small', { onclick: () => speak(l.sample || l.native, l.tts) }, 'Test')));
  });
  const audio = h(
    'div.card',
    h('h2', 'Audio'),
    h('div.stack',
      h('div', h('div.small.muted', 'Speaking speed'), h('div.row', rate, rateLabel)),
      h('p.tiny.faint', 'Course audio is pre-recorded with natural neural voices and works on every device. The options below only matter for the rare text without a recording.'),
      h('label.check', online, 'Fall back to an online voice when there is no recording or device voice'),
      h('p.tiny.faint', canRecognize() ? 'Speech recognition is available in this browser, so speaking exercises can check your pronunciation.' : 'Speech recognition is not available in this browser, so speaking exercises use record-and-compare instead. Chrome or Edge add automatic checking.'),
      h('div.table-wrap', h('table', voiceRows)),
    ),
  );

  // ----- data
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      let obj = null;
      try {
        obj = JSON.parse(await f.text());
      } catch {}
      if (!store.isProgressFile(obj)) throw new Error('This is not a Monsoon progress file.');
      const replace = await modal('Import progress', 'Merge the file with what is already here (keeps the most recent review of each item), or replace everything?', [
        { label: 'Cancel', value: null },
        { label: 'Replace', value: 'replace', danger: true },
        { label: 'Merge', value: 'merge', primary: true },
      ]);
      if (!replace) return;
      store.importData(obj, { replace: replace === 'replace' });
      toast('Progress imported.');
      go('/account?keep=1&t=' + Date.now());
    } catch (e) {
      toast(e.message);
    } finally {
      fileInput.value = ''; // so picking the same file again still fires 'change'
    }
  };
  const dataCard = h(
    'div.card#data',
    h('h2', 'Your data'),
    h('p.small.muted', 'Everything is stored in this browser. Export a file to back up, or to move your account to another device or browser. Importing a file while signed out recreates the account (same username and password).'),
    h(
      'div.row',
      h(
        'button.btn',
        {
          onclick: () => {
            const blob = new Blob([JSON.stringify(store.exportData(), null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `monsoon-${store.isGuest() ? 'guest' : store.currentUser()}-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.appendChild(a);
            a.click();
            a.remove();
          },
        },
        'Export progress',
      ),
      h('button.btn', { onclick: () => fileInput.click() }, 'Import progress'),
      fileInput,
    ),
    guest
      ? null
      : h(
          'div',
          { style: { marginTop: '16px' } },
          h(
            'button.btn.small.danger',
            {
              onclick: async () => {
                if (await modal('Delete account?', 'This permanently deletes your account and all its progress from this browser. Export first if you might want it back.', [{ label: 'Cancel', value: false }, { label: 'Delete account', value: true, danger: true }])) {
                  store.deleteAccount();
                  toast('Account deleted.');
                  go('/');
                }
              },
            },
            'Delete account',
          ),
        ),
  );

  return h('div.stack', { 'data-title': 'Settings', style: { maxWidth: '760px' } }, h('h1', 'Account & settings'), profile, progress, learning, audio, dataCard);
}
