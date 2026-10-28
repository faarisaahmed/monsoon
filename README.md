# Monsoon — learn the languages of South Asia

**Live site: https://faarisaahmed.github.io/monsoon/**

Monsoon is a calm, thorough, open-source course for the major languages of South Asia — India, Pakistan, Bangladesh, Nepal, Sri Lanka and the diaspora:

| Language | Script |
|---|---|
| Hindi हिन्दी | Devanagari |
| Urdu اردو | Perso-Arabic (Nastaliq) |
| Bengali বাংলা | Bengali–Assamese |
| Punjabi ਪੰਜਾਬੀ | Gurmukhi |
| Nepali नेपाली | Devanagari |
| Pashto پښتو | Perso-Arabic (Pashto) |
| Sindhi سنڌي | Perso-Arabic (Sindhi) |
| Marathi मराठी | Devanagari |
| Gujarati ગુજરાતી | Gujarati |
| Tamil தமிழ் | Tamil |
| Telugu తెలుగు | Telugu |
| Kannada ಕನ್ನಡ | Kannada |
| Malayalam മലയാളം | Malayalam |
| Odia ଓଡ଼ିଆ | Odia |

## What's in each course

- **Script**: every vowel, vowel sign, consonant, special mark, common conjuncts and native digits. Each one comes with audio, IPA, a plain-English description of the sound, an example word, stroke hints and a handwriting pad that scores your attempt. Letter lessons introduce a few letters at a time: each is shown, tested straight away, tested again a few questions later and at the end, and missed ones come back within the lesson. Learned letters join the review deck. For Urdu, Pashto and Sindhi every joining letter shows its start, middle and end shapes, and lessons ask about them.
- **Pronunciation**: 8–14 lessons on the sounds English speakers get wrong (retroflex vs dental, aspiration, nasal vowels, vowel length, Punjabi tones, Tamil ழ, Urdu q/x/ġ…), with minimal pairs, ear-training quizzes and speaking practice using your microphone.
- **A guided course in two parts**, the same path in every language. *Part 1 · Foundations* (units 1–20) goes from greetings to real conversation; *Part 2 · Real life & fluency* (units 21–40) is about talking with friends, getting around town, errands, work, opinions, feelings, and sounding natural.
- **Lessons built around sentences**: each unit is a row of short lessons, then its conversation and a check, and they open in order. A lesson starts with a quick tip on any new rule (with the full notes a tap away), introduces a few words and uses each one in a sentence straight away, then drills full sentences: fill the gap with the right form (with the forms learners really confuse as the wrong answers), build, listen and build, translate. Everything you learn joins the review deck.
- **Notes**: each unit keeps its full grammar explanations, word and phrase lists and culture notes to look back on, and a grammar handbook gathers every rule by topic, each with its own sentence practice.
- **Themes**: nine palettes (Monsoon auto/day/night, Jasmine, Lotus, Tea garden, Ink & paper, Indigo night, Diya), previewed and applied from the Themes page.
- **Sharing**: a quiet "Share Monsoon" link in the footer and on the About page (the device share sheet, or copy the link). Nothing ever asks you to share.
- **Extra practice** (for review, alongside the course): mixed sessions, flashcards, listening, dictation, translation, typing in the native script (with an on-screen keyboard), grammar in sentences, speaking (speech recognition, or record and compare), letter lessons, reading real words without romanization, handwriting and numbers.
- **Review**: spaced repetition (SM-2 style) across everything you've learned.
- **Conversation**: role-play any of the dialogues (you type or say your lines and compare with the original), or answer questions in your own words, with example answers from the course and a synced journal of what you wrote.
- **Reference**: numbers 0–100 plus lakh and crore, a searchable glossary and a reading room with all the dialogues.

## Design principles

- Minimal and quiet. There are no streaks, hearts, points or leaderboards. You see what you know and how much time you've put in, and the app suggests a sensible next step. Missing a day costs nothing.
- Script-first, though romanization can be set to *show*, *tap to reveal* or *hide*.
- It works offline as an installable PWA once loaded.

## Accounts and sync

Accounts use an email and password, and progress syncs across devices. The backend runs on [Neon](https://neon.com) and lives in `backend/`:

- **Neon Auth** (managed Better Auth) stores users and sessions in Postgres.
- **A Neon Function** (`backend/src/index.ts`, a small Hono API) sits between the site and Neon Auth. The site is on GitHub Pages, a different site from Neon Auth, and browsers (Safari especially) block the cross-site session cookie. So the Function forwards sign-up and sign-in, gives the browser its session token, and checks that token on every request. Each user can only read or write their own row.
- **Postgres** holds one `progress` row (JSON) per user. Saves carry a version number, so two devices saving at once can't overwrite each other: the second one gets the newer copy back, merges it and retries.

Progress is always kept in `localStorage` as well, so the app works offline and syncs when it's back online. Guests can use everything, and their progress moves into the account on sign-up or sign-in. Older device-only accounts (username and a salted PBKDF2 hash) still sign in, and their progress carries over to an online account. Forgotten passwords are reset with a 6-digit code sent by email.

Backend commands, run from `backend/` with the [Neon CLI](https://neon.com/docs/cli) linked to the project:

```sh
npm install
npm run migrate        # create or upgrade the progress table
npm run deploy         # neon deploy: Neon Auth + the sync Function
```

## Audio

Every word, phrase, sentence, letter and number has a pre-recorded clip in `audio/<code>/`, so audio works on any phone or computer with nothing to install. The clips come from Microsoft neural voices via `edge-tts`. Punjabi uses Google's voice and Odia uses Meta's open MMS-TTS model, because neither has a neural voice. Sindhi has no speech voice anywhere yet, so it has no audio, and its speaking exercises use record-and-compare. Device voices and an online voice are used only as a fallback.

To regenerate after editing content:

```sh
pip install edge-tts            # plus transformers + torch for Odia
node scripts/audio-texts.js > /tmp/texts.json
python3 scripts/make_audio.py /tmp/texts.json      # only creates missing clips, removes stale ones
```

Automatic pronunciation checking needs the Web Speech recognition API (Chrome, Edge, Safari). In other browsers it switches to record-and-compare.

## Running locally

It's a static site with no build step needed to run:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

After you edit course content:

```sh
node scripts/validate.js        # check every language against the schema
node scripts/build.js           # regenerate data/languages.json and sw.js
```

## Content

Course content lives in `data/<code>/course.json` and `data/<code>/units/01.json … 40.json`; each unit's `lessons` define its path. The format is documented in [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md). Corrections from native speakers are very welcome, so please open an issue or a pull request. The content was drafted with AI assistance and checked by schema validation, and a native-speaker review is the most valuable contribution you can make.

## License

Code: MIT. Course content: CC BY-SA 4.0.
