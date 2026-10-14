# Boli — learn the languages of India

**Live site: https://faarisaahmed.github.io/boli/**

Boli (बोली, "speech") is a calm, thorough, open-source course for eleven major languages of India and Pakistan:

| Language | Script |
|---|---|
| Hindi हिन्दी | Devanagari |
| Urdu اردو | Perso-Arabic (Nastaliq) |
| Bengali বাংলা | Bengali–Assamese |
| Punjabi ਪੰਜਾਬੀ | Gurmukhi |
| Marathi मराठी | Devanagari |
| Gujarati ગુજરાતી | Gujarati |
| Tamil தமிழ் | Tamil |
| Telugu తెలుగు | Telugu |
| Kannada ಕನ್ನಡ | Kannada |
| Malayalam മലയാളം | Malayalam |
| Odia ଓଡ଼ିଆ | Odia |

## What's in each course

- **Script**: every vowel, vowel sign, consonant, special mark, common conjuncts and native digits. Each one comes with audio, IPA, a plain-English description of the sound, an example word, stroke hints and a handwriting pad that scores your attempt.
- **Pronunciation**: 8–14 lessons on the sounds English speakers get wrong (retroflex vs dental, aspiration, nasal vowels, vowel length, Punjabi tones, Tamil ழ, Urdu q/x/ġ…), with minimal pairs, ear-training quizzes and speaking practice using your microphone.
- **20 units** following the same path in every language, from greetings to telling stories. Each unit has about 25 words, about 10 phrases, grammar explanations with examples, a dialogue and cultural notes.
- **Practice**: mixed sessions, flashcards, listening, dictation, translation, typing in the native script (with an on-screen keyboard), sentence building, speaking (speech recognition, or record and compare), letter drills, reading real words without romanization, handwriting and numbers.
- **Review**: spaced repetition (SM-2 style) across everything you've learned.
- **Reference**: numbers 0–100 plus lakh and crore, a searchable glossary, a grammar index, a printable alphabet chart and a reading room.

## Design principles

- Minimal and quiet. There are no streaks, hearts, points or leaderboards. You see what you know and how much time you've put in, and the app suggests a sensible next step. Missing a day costs nothing.
- Script-first, though romanization can be set to *show*, *tap to reveal* or *hide*.
- It works offline as an installable PWA once loaded.

## Accounts

Accounts are local to the browser. Each one has a username and a password (stored as a salted PBKDF2-SHA256 hash, never in plain text), and progress is kept per account, so several people can share a device. To move to another device, export your progress file under *Settings → Your data* and import it there. The file carries the account with it. Guests can use everything, and their progress moves into the account when they sign up.

## Audio

Boli uses the device's own speech-synthesis voices. If the device has no voice for a language, it falls back to an online voice (you can turn this off in Settings). Automatic pronunciation checking needs the Web Speech recognition API (Chrome, Edge, Safari). In other browsers it switches to record-and-compare.

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

Course content lives in `data/<code>/course.json` and `data/<code>/units/01.json … 20.json`. The format is documented in [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md). Corrections from native speakers are very welcome, so please open an issue or a pull request. The content was drafted with AI assistance and checked by schema validation, and a native-speaker review is the most valuable contribution you can make.

## License

Code: MIT. Course content: CC BY-SA 4.0.
