# Content schema

Every language lives in `data/<code>/`. All files are UTF-8 JSON (no comments, no trailing commas).

```
data/<code>/course.json      meta + script + pronunciation + numbers
data/<code>/units/01.json    unit 1
...
data/<code>/units/20.json    unit 20
```

Run `node scripts/validate.js <code>` after writing. It must print `OK`.

## Romanization conventions (all languages)

The `roman` field is a **learner-friendly phonetic romanization of how the word is actually pronounced
in the standard modern spoken language** (not a letter-by-letter transliteration when the two differ —
e.g. Hindi schwa deletion: कमल → `kamal`, समझना → `samajhnā`; Tamil voicing: நன்றி → `naṉṟi` is wrong
for learners, write `nandri`). Use one consistent scheme:

| Sound | Write |
|---|---|
| long vowels | `ā ī ū`, and `ē ō` only in languages that contrast short/long e/o (Dravidian); elsewhere plain `e o` |
| short vowels | `a i u e o` |
| diphthongs | `ai au` |
| Bengali/Odia inherent ɔ | `ô` |
| retroflex stops/nasal | `ṭ ṭh ḍ ḍh ṇ` |
| flaps | `ṛ ṛh` (Hindi/Urdu/Punjabi ड़ ढ़) |
| retroflex lateral | `ḷ` |
| Tamil/Malayalam ழ | `ḻ` |
| Malayalam/Tamil alveolar ṟ, ṉ | `ṟ ṉ` (only where it matters; Tamil றற → `ṯṯ`/`tr` as pronounced) |
| aspirates | `kh gh chh jh ṭh ḍh th dh ph bh` |
| च / ச etc. | `ch` |
| श | `sh` ; ष `ṣ` |
| velar nasal ङ | `ṅ` ; palatal ञ `ñ` |
| anusvara / nasal vowel | `ṃ` after vowel for vowel nasalization (हाँ → `hāṃ`, मैं → `maiṃ`); anusvara before a stop is written as the homorganic nasal (हिंदी → `hindī`) |
| visarga | `ḥ` |
| Urdu ق خ غ ع ء ژ ز ذ ض ظ | `q x ġ ʿ ’ zh z z z z` (and `kh` is always the aspirated k, never خ) |
| Urdu ے | `e` ; ی as vowel `ī` or `ai` as pronounced |

Capitalise nothing except proper nouns. Separate words with spaces as in the native text.

## course.json

```json
{
  "code": "hi",
  "name": "Hindi",
  "native": "हिन्दी",
  "scriptName": "Devanagari",           // name of the writing system (the "script" key below holds the letters)
  "dir": "ltr",                          // "rtl" for Urdu
  "tts": "hi-IN",                        // BCP-47 for speech synthesis/recognition
  "font": "Noto Sans Devanagari",        // Google Fonts family name for this script
  "speakers": "≈600 million (L1 + L2)",
  "where": "Northern and central India; lingua franca across much of India",
  "tagline": "One sentence on why to learn it.",
  "intro": "2–4 short paragraphs (separate with \\n\\n). What the language is, its script, how it relates to its neighbours, register (formal/informal), what this course teaches. **bold** and *italic* allowed.",
  "romanizationNote": "1 paragraph: how to read this course's romanization for this language, specific pitfalls.",

  "script": {
    "overview": "Paragraphs (\\n\\n) on how the script works: abugida, inherent vowel, vowel signs (matras), virama, conjuncts, direction, headline (shirorekha) etc.",
    "groups": [
      {
        "id": "vowels",
        "title": "Vowels",
        "note": "Short explanation of this group.",
        "letters": [
          {
            "char": "अ",
            "roman": "a",
            "ipa": "ə",
            "sound": "Plain-English description of the sound, e.g. 'the a in about'.",
            "sign": "",                    // vowel sign / matra form if a vowel, e.g. "ा" (use "—" for inherent a); omit for consonants
            "signExample": "",             // e.g. "का (kā)" — optional
            "example": { "native": "अनार", "roman": "anār", "en": "pomegranate" },
            "strokes": "Brief stroke-order hint for writing by hand (optional but encouraged)."
          }
        ]
      }
    ]
  },

  "pronunciation": [
    {
      "id": "retroflex",
      "title": "Retroflex vs dental consonants",
      "body": "Paragraphs (\\n\\n) explaining mouth position, how English speakers get it wrong, how to practise.",
      "tips": ["short actionable tip", "..."],
      "pairs": [
        {
          "a": { "native": "टाल", "roman": "ṭāl", "en": "postpone" },
          "b": { "native": "ताल", "roman": "tāl", "en": "rhythm / pond" },
          "note": "optional: what differs"
        }
      ],
      "drill": [ { "native": "word or short phrase", "roman": "...", "en": "..." } ]
    }
  ],

  "numbers": [ { "n": 0, "native": "शून्य", "roman": "shūnya", "digit": "०" } ]
}
```

### script.groups requirements
Cover the **entire** modern alphabet as actually taught in schools: all vowels (with their vowel-sign forms),
all consonants (grouped by place of articulation the traditional way: velar, palatal, retroflex, dental, labial,
then semivowels/sibilants/others), plus groups for: special marks (anusvara, chandrabindu, visarga, virama/halant,
nukta / equivalents), **at least 12 common conjuncts / ligatures** (each as a "letter" whose `char` is the conjunct,
with `roman` and an example), and the native digits 0–9 (if the script has its own digits). For Urdu, give
each letter's isolated form in `char` and describe joining forms in `sound` or `strokes`; include aspirated
(do-chashmi he) combinations, the short-vowel diacritics (zabar, zer, pesh, jazm, tashdid) and common ligatures.
For Tamil, include the grantha letters and a group on how the uyirmey (consonant+vowel) series works.

### pronunciation requirements
8–14 topics. Must include the topics that genuinely trouble English speakers for this language
(e.g. aspiration, retroflex vs dental, nasal vowels, vowel length, gemination/double consonants,
the inherent vowel/schwa deletion, ழ/ള/ण type sounds, ṛ flaps, tone in Punjabi, Urdu q/x/ġ/ʿ, Bengali ô,
Tamil voicing rules, stress & rhythm, intonation of questions). Each topic: 3–8 minimal `pairs` where
possible (real words!) and a `drill` of 4–10 items.

### numbers requirements
**Every** number 0–100 individually (many of these languages have irregular 1–99), then 200, 500, 1000,
100000 (lakh), 10000000 (crore). `digit` = native digits if the script has them, else western.

## units/NN.json

Every language uses the same 20-unit curriculum (so learners can compare), adapted naturally:

```json
{
  "id": 1,
  "title": "First words",
  "goal": "One sentence: what you'll be able to do after this unit.",
  "intro": "Short paragraph (\\n\\n allowed).",
  "vocab": [
    { "native": "नमस्ते", "roman": "namaste", "en": "hello (formal/neutral)", "pos": "interj", "note": "optional usage note" }
  ],
  "phrases": [
    { "native": "आप कैसे हैं?", "roman": "āp kaise haiṃ?", "en": "How are you? (polite, to a man)", "note": "optional" }
  ],
  "grammar": [
    {
      "title": "Word order: subject–object–verb",
      "body": "Clear explanation for an English speaker (\\n\\n paragraphs, **bold** allowed). Include tables as simple lines if needed.",
      "examples": [ { "native": "...", "roman": "...", "en": "..." } ]
    }
  ],
  "dialogue": {
    "title": "At the tea stall",
    "setting": "One line of context.",
    "lines": [ { "speaker": "Ravi", "native": "...", "roman": "...", "en": "..." } ]
  },
  "culture": "Optional short paragraph: etiquette, regional variation, register."
}
```

`pos` values: `noun verb adj adv pron postp prep conj interj num phrase particle q` (q = question word).
For nouns in gendered languages put gender in `note` like `"m"` / `"f"` (or `"m · pl: ..."`).
For verbs give the dictionary/infinitive form (or the form a dictionary would list for that language) and
in `note` give anything irregular.

### Size per unit
- `vocab`: **22–32** items, most frequent and genuinely useful words first; no duplicates across units.
- `phrases`: **8–14** natural, high-frequency sentences.
- `grammar`: **1–3** points, each with **3–6** examples, progressing across units.
- `dialogue`: **6–12** lines, using mostly this and earlier units' vocabulary.

### The 20 units
1. First words — greetings, yes/no, please/thank you, sorry, basic courtesy. Grammar: word order (SOV), register (formal/informal "you").
2. About me — pronouns, "to be", name, where from, languages. Grammar: pronouns + copula; question words intro.
3. Family & people — relatives, people words. Grammar: possessives; gender/plural of nouns (as relevant).
4. Numbers, age & quantities — (refers to the numbers chart) how many, how much, age, ordinals 1st–10th. Grammar: counting nouns / plural with numbers; asking quantity.
5. Food & drink — common foods, meals, tastes, ordering. Grammar: "I want / I like" constructions (incl. dative-subject if the language uses it).
6. Home & everyday objects — rooms, furniture, objects. Grammar: postpositions/case markers of location (in, on, under, near); "there is / there are".
7. Time, days & months — clock time, days, months, parts of day, yesterday/tomorrow. Grammar: telling time; time expressions.
8. Describing things — colours, sizes, common adjectives. Grammar: adjective agreement; comparison (more/most).
9. Body & health — body parts, illnesses, doctor. Grammar: "I have a headache" / experiencer constructions; "should".
10. Daily routine — common verbs, habits. Grammar: present habitual & present continuous.
11. Getting around — directions, transport, places in town. Grammar: imperative (polite/informal); location/direction cases.
12. Shopping & money — prices, bargaining, clothes, sizes. Grammar: demonstratives; "this one/that one"; how much.
13. Weather, nature & seasons. Grammar: impersonal/weather expressions; "it is going to".
14. Feelings & opinions — emotions, likes, agreeing/disagreeing. Grammar: "I think that…", conjunctions because/but/so.
15. Work & study — jobs, school, office. Grammar: "can / must / have to" (ability & obligation).
16. What happened — past events. Grammar: simple past (incl. ergative construction where it exists).
17. Plans & the future. Grammar: future tense; "want to / going to".
18. Politeness, requests & invitations — honorifics, asking favours, offering, refusing. Grammar: polite imperatives, subjunctive/optative, "could you".
19. Travel, problems & emergencies — hotel, train, lost, help, police, hospital. Grammar: conditionals ("if… then").
20. Telling stories & real conversation — connectors, fillers, relative clauses, common idioms, reported speech basics.

## Quality bar
- Use the **standard modern spoken** language that a learner will actually hear; note common colloquial
  alternatives in `note`. Avoid archaic/Sanskritised forms unless that *is* the everyday word.
- Every `native` string must be correctly spelled in the native script; every `roman` must match it.
- English glosses short and precise. Mark register (formal/informal) where it matters.
- No duplicated vocab across units within a language.
